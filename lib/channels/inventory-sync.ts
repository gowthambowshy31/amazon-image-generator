import { prisma } from "@/lib/prisma"
import { getAmazonSPCredsForOrg, getAllAmazonInventory } from "./amazon-sp"
import { getValidEbayToken } from "./ebay-auth"
import { updateInventoryQuantity } from "./ebay-inventory"
import { withRetry, isRetryableError } from "./retry"

export interface ChannelSyncResult {
  syncLogId: string
  totalAmazonItems: number
  productsUpserted: number
  ebayUpdates: number
  errors: number
}

export async function syncChannelInventory(organizationId: string): Promise<ChannelSyncResult> {
  const start = Date.now()
  const log = await prisma.syncLog.create({
    data: {
      organizationId,
      module: "channels",
      syncType: "inventory-sync",
      status: "started",
    },
  })

  let totalAmazonItems = 0
  let productsUpserted = 0
  let ebayUpdates = 0
  let errors = 0

  try {
    const config = await prisma.channelsSyncConfig.findUnique({ where: { organizationId } })
    const quantityBuffer = config?.quantityBuffer ?? 5

    const amazonCreds = await getAmazonSPCredsForOrg(organizationId)
    if (!amazonCreds) throw new Error("No active Amazon connection for org")

    const items = await getAllAmazonInventory(amazonCreds)
    totalAmazonItems = items.length

    for (const item of items) {
      try {
        await prisma.channelSku.upsert({
          where: { organizationId_amazonSku: { organizationId, amazonSku: item.sellerSku } },
          create: {
            organizationId,
            amazonSku: item.sellerSku,
            amazonAsin: item.asin,
            title: item.productName,
            amazonQuantity: item.inventoryDetails.fulfillableQuantity,
            lastSyncedAt: new Date(),
          },
          update: {
            amazonAsin: item.asin,
            title: item.productName,
            amazonQuantity: item.inventoryDetails.fulfillableQuantity,
            lastSyncedAt: new Date(),
            lastSyncError: null,
          },
        })
        productsUpserted++
      } catch (e) {
        errors++
      }
    }

    // Push to eBay where mapped
    const ebay = await getValidEbayToken(organizationId)
    if (ebay) {
      const mapped = await prisma.channelSku.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: [{ ebaySku: { not: null } }, { ebayItemId: { not: null } }],
        },
      })
      for (const product of mapped) {
        try {
          const newQty = Math.max(0, product.amazonQuantity - quantityBuffer)
          if (newQty !== product.ebayQuantity) {
            const sku = product.ebaySku ?? product.amazonSku
            await withRetry(
              () => updateInventoryQuantity(ebay.creds, ebay.token, sku, newQty),
              { maxRetries: 2, backoffMs: 1000, retryOn: isRetryableError },
            )
            await prisma.channelSku.update({
              where: { id: product.id },
              data: { ebayQuantity: newQty, lastSyncedAt: new Date(), lastSyncError: null },
            })
            ebayUpdates++
          }
        } catch (e: any) {
          errors++
          await prisma.channelSku.update({
            where: { id: product.id },
            data: { lastSyncError: e?.message || String(e) },
          })
        }
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: errors > 0 ? "completed_with_errors" : "done",
        recordsProcessed: productsUpserted,
        errors,
        durationMs: Date.now() - start,
        completedAt: new Date(),
      },
    })

    return { syncLogId: log.id, totalAmazonItems, productsUpserted, ebayUpdates, errors }
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
