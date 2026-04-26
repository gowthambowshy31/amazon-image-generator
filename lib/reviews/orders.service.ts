import { prisma } from "@/lib/prisma"
import type { ReviewsSPClient } from "./sp-client"
import { isInEligibilityWindow } from "./dates"
import { subDays } from "date-fns"

export async function syncReviewOrders(spClient: ReviewsSPClient, organizationId: string) {
  const log = await prisma.syncLog.create({
    data: { organizationId, module: "reviews", syncType: "orders", status: "started" },
  })

  let processed = 0
  let created = 0
  let updated = 0
  const errors: string[] = []

  try {
    const createdAfter = subDays(new Date(), 45).toISOString()
    let nextToken: string | undefined
    do {
      const response = await spClient.getOrders(createdAfter, nextToken)
      const orders = response.Orders || []
      for (const order of orders) {
        try {
          const wasNew = await upsertOrder(order, organizationId)
          processed++
          if (wasNew) created++
          else updated++
        } catch (e: any) {
          errors.push(`${order.AmazonOrderId}: ${e?.message || String(e)}`)
        }
      }
      nextToken = response.NextToken
    } while (nextToken)

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "done",
        recordsProcessed: processed,
        recordsCreated: created,
        recordsUpdated: updated,
        errors: errors.length,
        errorDetails: errors.length ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    })
    return { processed, created, updated, errors: errors.length }
  } catch (e: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        recordsProcessed: processed,
        errors: errors.length + 1,
        errorDetails: JSON.stringify([...errors, e?.message || String(e)]),
        completedAt: new Date(),
      },
    })
    throw e
  }
}

async function upsertOrder(order: any, organizationId: string): Promise<boolean> {
  const purchaseDate = new Date(order.PurchaseDate)
  const earliestShipDate = order.EarliestShipDate ? new Date(order.EarliestShipDate) : null
  const latestShipDate = order.LatestShipDate ? new Date(order.LatestShipDate) : null
  const earliestDeliveryDate = order.EarliestDeliveryDate ? new Date(order.EarliestDeliveryDate) : null
  const latestDeliveryDate = order.LatestDeliveryDate ? new Date(order.LatestDeliveryDate) : null

  const effectiveEarliest = earliestDeliveryDate || earliestShipDate
  const effectiveLatest = latestDeliveryDate || latestShipDate

  const existing = await prisma.reviewOrder.findUnique({
    where: { organizationId_amazonOrderId: { organizationId, amazonOrderId: order.AmazonOrderId } },
    select: { id: true, isRefunded: true },
  })
  const isRefunded = existing?.isRefunded ?? false

  const isEligible =
    order.OrderStatus === "Shipped" && !isRefunded && isInEligibilityWindow(effectiveEarliest, effectiveLatest)

  await prisma.reviewOrder.upsert({
    where: { organizationId_amazonOrderId: { organizationId, amazonOrderId: order.AmazonOrderId } },
    create: {
      organizationId,
      amazonOrderId: order.AmazonOrderId,
      purchaseDate,
      orderStatus: order.OrderStatus,
      fulfillmentChannel: order.FulfillmentChannel || null,
      orderTotal: order.OrderTotal ? JSON.stringify(order.OrderTotal) : null,
      buyerInfo: order.BuyerInfo ? JSON.stringify(order.BuyerInfo) : null,
      earliestShipDate,
      latestShipDate,
      earliestDeliveryDate,
      latestDeliveryDate,
      isEligible,
    },
    update: {
      orderStatus: order.OrderStatus,
      fulfillmentChannel: order.FulfillmentChannel || null,
      orderTotal: order.OrderTotal ? JSON.stringify(order.OrderTotal) : null,
      buyerInfo: order.BuyerInfo ? JSON.stringify(order.BuyerInfo) : null,
      earliestShipDate,
      latestShipDate,
      earliestDeliveryDate,
      latestDeliveryDate,
      isEligible,
    },
  })
  return !existing
}

export async function listReviewOrders(
  organizationId: string,
  options: {
    page?: number
    limit?: number
    status?: string
    eligible?: string
    refunded?: string
    search?: string
  } = {},
) {
  const { page = 1, limit = 20, status, eligible, refunded, search } = options
  const skip = (page - 1) * limit
  const where: Record<string, any> = { organizationId }
  if (status) where.orderStatus = status
  if (eligible === "true") where.isEligible = true
  if (eligible === "false") where.isEligible = false
  if (refunded === "true") where.isRefunded = true
  if (refunded === "false") where.isRefunded = false
  if (search) where.amazonOrderId = { contains: search }

  const [orders, total] = await Promise.all([
    prisma.reviewOrder.findMany({
      where,
      include: { solicitation: true },
      orderBy: { purchaseDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.reviewOrder.count({ where }),
  ])
  return { orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
