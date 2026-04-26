import { prisma } from "@/lib/prisma"
import { getAmazonSPClientForOrg } from "@/lib/amazon-sp"

export async function refreshCurrentInventory(organizationId: string) {
  const sp = await getAmazonSPClientForOrg(organizationId)
  const items = await sp.getInventorySummariesWithDetail()
  let upserted = 0
  for (const item of items) {
    await prisma.currentInventory.upsert({
      where: { organizationId_asin: { organizationId, asin: item.asin } },
      create: {
        organizationId,
        asin: item.asin,
        sku: item.sellerSku,
        fnsku: item.fnSku,
        productName: item.productName,
        fulfillableQty: item.fulfillableQuantity,
        reservedQty: item.reservedQuantity,
        inboundQty:
          item.inboundWorkingQuantity + item.inboundShippedQuantity + item.inboundReceivingQuantity,
        unfulfillableQty: item.unfulfillableQuantity,
        totalQty: item.totalQuantity,
        lastUpdated: new Date(),
      },
      update: {
        sku: item.sellerSku,
        fnsku: item.fnSku,
        productName: item.productName,
        fulfillableQty: item.fulfillableQuantity,
        reservedQty: item.reservedQuantity,
        inboundQty:
          item.inboundWorkingQuantity + item.inboundShippedQuantity + item.inboundReceivingQuantity,
        unfulfillableQty: item.unfulfillableQuantity,
        totalQty: item.totalQuantity,
        lastUpdated: new Date(),
      },
    })
    upserted++
  }
  return { upserted }
}

export async function takeInventorySnapshot(organizationId: string, notes?: string) {
  const sp = await getAmazonSPClientForOrg(organizationId)
  const items = await sp.getInventorySummariesWithDetail()

  const snapshot = await prisma.inventorySnapshot.create({
    data: {
      organizationId,
      snapshotDate: new Date(),
      source: "sp_api",
      totalAsins: items.length,
      totalUnits: items.reduce((s, i) => s + (i.totalQuantity || 0), 0),
      notes,
    },
  })

  for (const item of items) {
    await prisma.inventorySnapshotItem.create({
      data: {
        snapshotId: snapshot.id,
        asin: item.asin,
        sku: item.sellerSku,
        fnsku: item.fnSku,
        productName: item.productName,
        fulfillableQty: item.fulfillableQuantity,
        reservedQty: item.reservedQuantity,
        inboundQty:
          item.inboundWorkingQuantity + item.inboundShippedQuantity + item.inboundReceivingQuantity,
        unfulfillableQty: item.unfulfillableQuantity,
        totalQty: item.totalQuantity,
      },
    })
  }
  return snapshot
}
