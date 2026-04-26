import { prisma } from "@/lib/prisma"
import type { ReviewsSPClient } from "./sp-client"
import { getOrderQueue } from "./rate-limiter"
import { subDays } from "date-fns"

const ELIGIBILITY_REFRESH_MAX_AGE_DAYS = 45
const ELIGIBILITY_REFRESH_MIN_INTERVAL_HOURS = 24

export async function refreshEligibility(spClient: ReviewsSPClient, organizationId: string) {
  const maxAge = subDays(new Date(), ELIGIBILITY_REFRESH_MAX_AGE_DAYS)
  const minInterval = new Date(Date.now() - ELIGIBILITY_REFRESH_MIN_INTERVAL_HOURS * 60 * 60 * 1000)

  const candidates = await prisma.reviewOrder.findMany({
    where: {
      organizationId,
      orderStatus: "Shipped",
      isRefunded: false,
      OR: [
        { earliestShipDate: { gte: maxAge } },
        { earliestDeliveryDate: { gte: maxAge } },
      ],
      AND: [
        {
          OR: [
            { eligibilityCheckedAt: null },
            { eligibilityCheckedAt: { lt: minInterval } },
            { solicitation: { status: "NOT_ELIGIBLE" } },
          ],
        },
      ],
    },
    select: { amazonOrderId: true },
  })

  if (candidates.length === 0) return { checked: 0, results: [] }

  const results = await checkEligibility(spClient, organizationId, candidates.map((o) => o.amazonOrderId))
  return { checked: results.length, results }
}

export async function checkEligibility(spClient: ReviewsSPClient, organizationId: string, orderIds: string[]) {
  const queue = getOrderQueue(organizationId)
  const results: { orderId: string; eligible: boolean; error?: string }[] = []

  for (const amazonOrderId of orderIds) {
    const result = await queue.add(async () => {
      try {
        const eligibility = await spClient.checkEligibility(amazonOrderId)
        const isEligible = eligibility.actions?.some((a) => a.name === "productReviewAndSellerFeedback") ?? false
        await prisma.reviewOrder.updateMany({
          where: { organizationId, amazonOrderId },
          data: { isEligible, eligibilityCheckedAt: new Date() },
        })
        return { orderId: amazonOrderId, eligible: isEligible }
      } catch (error: any) {
        return { orderId: amazonOrderId, eligible: false, error: error?.message || "Unknown error" }
      }
    })
    if (result) results.push(result)
  }
  return results
}

export async function sendSolicitations(spClient: ReviewsSPClient, organizationId: string, orderIds: string[]) {
  const queue = getOrderQueue(organizationId)
  const results: { orderId: string; status: string; requestId?: string | null; error?: string }[] = []

  for (const amazonOrderId of orderIds) {
    const result = await queue.add(async () => {
      try {
        const order = await prisma.reviewOrder.findFirst({
          where: { organizationId, amazonOrderId },
          include: { solicitation: true },
        })
        if (!order) return { orderId: amazonOrderId, status: "SKIPPED", error: "Order not found" }
        if (order.orderStatus !== "Shipped")
          return { orderId: amazonOrderId, status: "SKIPPED", error: `Status is ${order.orderStatus}` }
        if (order.isRefunded) return { orderId: amazonOrderId, status: "SKIPPED", error: "Order refunded" }
        if (order.solicitation && order.solicitation.status === "SENT")
          return { orderId: amazonOrderId, status: "SKIPPED", error: "Already solicited" }

        const apiResult = await spClient.sendReviewRequest(amazonOrderId)
        const status = apiResult.success ? "SENT" : apiResult.notEligible ? "NOT_ELIGIBLE" : "FAILED"

        await prisma.reviewSolicitation.upsert({
          where: { orderId: order.id },
          create: {
            organizationId,
            orderId: order.id,
            amazonOrderId,
            status,
            httpStatusCode: apiResult.httpStatusCode,
            requestId: apiResult.requestId,
            rateLimitValue: apiResult.rateLimitValue,
            responseBody: apiResult.responseBody,
            responseHeaders: apiResult.responseHeaders,
            errorCode: apiResult.errorCode || null,
            errorMessage: apiResult.errorMessage || null,
            sentAt: apiResult.success ? new Date() : null,
          },
          update: {
            status,
            httpStatusCode: apiResult.httpStatusCode,
            requestId: apiResult.requestId,
            rateLimitValue: apiResult.rateLimitValue,
            responseBody: apiResult.responseBody,
            responseHeaders: apiResult.responseHeaders,
            errorCode: apiResult.errorCode || null,
            errorMessage: apiResult.errorMessage || null,
            sentAt: apiResult.success ? new Date() : null,
            retryCount: { increment: 1 },
          },
        })

        if (apiResult.notEligible) {
          await prisma.reviewOrder.update({ where: { id: order.id }, data: { isEligible: false } })
        }

        return { orderId: amazonOrderId, status, requestId: apiResult.requestId, error: apiResult.errorMessage }
      } catch (error: any) {
        return { orderId: amazonOrderId, status: "FAILED", error: error?.message || "Unknown error" }
      }
    })
    if (result) results.push(result)
  }
  return results
}

export async function sendBatchSolicitations(spClient: ReviewsSPClient, organizationId: string, sendAfterDays?: number) {
  const cutoffDate = sendAfterDays ? subDays(new Date(), sendAfterDays) : undefined
  const eligibleOrders = await prisma.reviewOrder.findMany({
    where: {
      organizationId,
      isEligible: true,
      isRefunded: false,
      orderStatus: "Shipped",
      AND: [
        { OR: [{ solicitation: null }, { solicitation: { status: "NOT_ELIGIBLE" } }] },
        ...(cutoffDate
          ? [
              {
                OR: [
                  { earliestDeliveryDate: { lte: cutoffDate } },
                  { earliestDeliveryDate: null, earliestShipDate: { lte: cutoffDate } },
                ],
              },
            ]
          : []),
      ],
    },
    select: { amazonOrderId: true },
  })

  if (eligibleOrders.length === 0) return { sent: 0, results: [], message: "No eligible orders found" }

  const orderIds = eligibleOrders.map((o) => o.amazonOrderId)
  const results = await sendSolicitations(spClient, organizationId, orderIds)
  return {
    sent: results.filter((r) => r.status === "SENT").length,
    failed: results.filter((r) => r.status === "FAILED").length,
    notEligible: results.filter((r) => r.status === "NOT_ELIGIBLE").length,
    skipped: results.filter((r) => r.status === "SKIPPED").length,
    total: results.length,
    results,
  }
}

export async function listSolicitations(
  organizationId: string,
  options: { page?: number; limit?: number; status?: string } = {},
) {
  const { page = 1, limit = 20, status } = options
  const skip = (page - 1) * limit
  const where: Record<string, any> = { organizationId }
  if (status) where.status = status

  const [solicitations, total] = await Promise.all([
    prisma.reviewSolicitation.findMany({
      where,
      include: {
        order: {
          select: {
            amazonOrderId: true,
            purchaseDate: true,
            orderStatus: true,
            earliestDeliveryDate: true,
            latestDeliveryDate: true,
            orderTotal: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.reviewSolicitation.count({ where }),
  ])
  return { solicitations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
