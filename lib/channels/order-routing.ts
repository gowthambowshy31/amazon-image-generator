import { prisma } from "@/lib/prisma"
import { getValidEbayToken } from "./ebay-auth"
import { getAmazonSPCredsForOrg, createFulfillmentOrder, getFulfillmentOrder } from "./amazon-sp"
import { ebayApiCall } from "./ebay-client"

const DEFAULT_SHIPPING_SPEED = "Standard" as const

interface EbayOrder {
  orderId: string
  buyer?: { username?: string }
  pricingSummary?: { total?: { value: string; currency: string } }
  fulfillmentStartInstructions?: any[]
  lineItems?: any[]
}

// Poll eBay for unshipped orders and create matching Amazon MCF orders
export async function pollEbayOrders(organizationId: string) {
  const start = Date.now()
  const log = await prisma.syncLog.create({
    data: { organizationId, module: "channels", syncType: "order-poll", status: "started" },
  })

  let created = 0
  let errors = 0

  try {
    const ebay = await getValidEbayToken(organizationId)
    if (!ebay) throw new Error("eBay not connected")

    const ordersResp = await ebayApiCall<{ orders?: EbayOrder[] }>(
      ebay.creds,
      ebay.token,
      "/sell/fulfillment/v1/order?filter=" + encodeURIComponent("orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}") + "&limit=50",
    )

    const orders = ordersResp.orders || []
    const config = await prisma.channelsSyncConfig.findUnique({ where: { organizationId } })
    const shippingSpeed = (config?.shippingSpeed || DEFAULT_SHIPPING_SPEED) as any

    const amazonCreds = await getAmazonSPCredsForOrg(organizationId)
    if (!amazonCreds) throw new Error("No active Amazon connection")

    for (const order of orders) {
      try {
        const existing = await prisma.mcfOrder.findUnique({ where: { ebayOrderId: order.orderId } })
        if (existing) continue

        const fulfillmentInstr = order.fulfillmentStartInstructions?.[0]
        const ship = fulfillmentInstr?.shippingStep?.shipTo
        const lineItems = order.lineItems || []

        const mcfRecord = await prisma.mcfOrder.create({
          data: {
            organizationId,
            ebayOrderId: order.orderId,
            ebayBuyerUsername: order.buyer?.username,
            status: "pending",
            shippingName: ship?.fullName,
            shippingLine1: ship?.contactAddress?.addressLine1,
            shippingLine2: ship?.contactAddress?.addressLine2,
            shippingCity: ship?.contactAddress?.city,
            shippingState: ship?.contactAddress?.stateOrProvince,
            shippingZip: ship?.contactAddress?.postalCode,
            shippingCountry: ship?.contactAddress?.countryCode,
            shippingPhone: ship?.primaryPhone?.phoneNumber,
            totalPrice: order.pricingSummary?.total?.value
              ? parseFloat(order.pricingSummary.total.value)
              : null,
            currency: order.pricingSummary?.total?.currency,
            items: {
              create: lineItems.map((li: any) => ({
                amazonSku: li.sku || "",
                ebaySku: li.sku,
                ebayLineItemId: li.lineItemId,
                quantity: li.quantity || 1,
              })),
            },
          },
        })

        // Submit to Amazon MCF
        try {
          const sellerFulfillmentOrderId = `EBAY-${order.orderId}`.slice(0, 40)
          const mcfPayload = {
            sellerFulfillmentOrderId,
            displayableOrderId: sellerFulfillmentOrderId,
            displayableOrderDate: new Date().toISOString(),
            displayableOrderComment: `eBay order ${order.orderId}`,
            shippingSpeedCategory: shippingSpeed,
            destinationAddress: {
              name: ship?.fullName || "Customer",
              addressLine1: ship?.contactAddress?.addressLine1 || "",
              addressLine2: ship?.contactAddress?.addressLine2,
              city: ship?.contactAddress?.city || "",
              stateOrRegion: ship?.contactAddress?.stateOrProvince || "",
              postalCode: ship?.contactAddress?.postalCode || "",
              countryCode: ship?.contactAddress?.countryCode || "US",
              phone: ship?.primaryPhone?.phoneNumber,
            },
            items: lineItems.map((li: any, idx: number) => ({
              sellerSku: li.sku || "",
              sellerFulfillmentOrderItemId: `${sellerFulfillmentOrderId}-${idx}`,
              quantity: li.quantity || 1,
            })),
          }

          await createFulfillmentOrder(amazonCreds, mcfPayload)
          await prisma.mcfOrder.update({
            where: { id: mcfRecord.id },
            data: { amazonFulfillmentId: sellerFulfillmentOrderId, status: "submitted" },
          })
          created++
        } catch (e: any) {
          await prisma.mcfOrder.update({
            where: { id: mcfRecord.id },
            data: { status: "failed", errorMessage: e?.message || String(e) },
          })
          errors++
        }
      } catch (e) {
        errors++
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: errors > 0 ? "completed_with_errors" : "done",
        recordsProcessed: orders.length,
        recordsCreated: created,
        errors,
        durationMs: Date.now() - start,
        completedAt: new Date(),
      },
    })

    return { polled: orders.length, created, errors }
  } catch (e: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        errorDetails: e?.message || String(e),
        durationMs: Date.now() - start,
        completedAt: new Date(),
      },
    })
    throw e
  }
}

// Poll Amazon for tracking on submitted MCF orders
export async function syncMcfTracking(organizationId: string) {
  const amazonCreds = await getAmazonSPCredsForOrg(organizationId)
  if (!amazonCreds) return { updated: 0 }
  const pending = await prisma.mcfOrder.findMany({
    where: {
      organizationId,
      status: { in: ["submitted", "processing"] },
      amazonFulfillmentId: { not: null },
    },
    take: 50,
  })

  let updated = 0
  for (const order of pending) {
    try {
      const result: any = await getFulfillmentOrder(amazonCreds, order.amazonFulfillmentId!)
      const fulfillmentShipments = result?.payload?.fulfillmentShipments || []
      const tracking = fulfillmentShipments[0]?.fulfillmentShipmentPackage?.[0]
      const status = result?.payload?.fulfillmentOrder?.fulfillmentOrderStatus
      await prisma.mcfOrder.update({
        where: { id: order.id },
        data: {
          status: status?.toLowerCase() || order.status,
          trackingNumber: tracking?.trackingNumber,
          carrierCode: tracking?.carrierCode,
        },
      })
      updated++
    } catch {
      // skip on error, retry next cycle
    }
  }
  return { updated }
}
