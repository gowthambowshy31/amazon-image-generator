import { prisma } from "@/lib/prisma"
import type { ReviewsSPClient } from "./sp-client"
import { getFinancesQueue } from "./rate-limiter"
import { subHours } from "date-fns"

export async function checkRefunds(spClient: ReviewsSPClient, organizationId: string) {
  const log = await prisma.syncLog.create({
    data: { organizationId, module: "reviews", syncType: "refunds", status: "started" },
  })

  let checked = 0
  let refunded = 0
  let errorCount = 0
  const errors: string[] = []

  try {
    const cutoff = subHours(new Date(), 24)
    const ordersToCheck = await prisma.reviewOrder.findMany({
      where: {
        organizationId,
        orderStatus: "Shipped",
        isRefunded: false,
        OR: [{ refundCheckedAt: null }, { refundCheckedAt: { lt: cutoff } }],
      },
      select: { id: true, amazonOrderId: true },
    })

    if (ordersToCheck.length === 0) {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "done", recordsProcessed: 0, completedAt: new Date() },
      })
      return { checked: 0, refunded: 0, errors: 0 }
    }

    const queue = getFinancesQueue(organizationId)
    for (const order of ordersToCheck) {
      await queue.add(async () => {
        try {
          const events = await spClient.getFinancialEvents(order.amazonOrderId)
          const refundEvents = events?.FinancialEvents?.RefundEventList || []
          const hasRefund = refundEvents.length > 0
          if (hasRefund) {
            await prisma.reviewOrder.update({
              where: { id: order.id },
              data: { isRefunded: true, isEligible: false, refundCheckedAt: new Date() },
            })
            refunded++
          } else {
            await prisma.reviewOrder.update({
              where: { id: order.id },
              data: { refundCheckedAt: new Date() },
            })
          }
          checked++
        } catch (e: any) {
          errorCount++
          errors.push(`${order.amazonOrderId}: ${e?.message || String(e)}`)
        }
      })
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "done",
        recordsProcessed: checked,
        recordsCreated: refunded,
        errors: errorCount,
        errorDetails: errors.length ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    })

    return { checked, refunded, errors: errorCount }
  } catch (e: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        recordsProcessed: checked,
        errors: errorCount + 1,
        errorDetails: JSON.stringify([...errors, e?.message || String(e)]),
        completedAt: new Date(),
      },
    })
    throw e
  }
}
