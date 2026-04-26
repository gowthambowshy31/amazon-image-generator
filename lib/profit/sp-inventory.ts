import { prisma } from "@/lib/prisma"
import { getAmazonSPCredsForOrg, getAllAmazonInventory } from "@/lib/channels/amazon-sp"

export async function refreshCurrentInventory(organizationId: string) {
  const c = await getAmazonSPCredsForOrg(organizationId)
  if (!c) throw new Error("No active Amazon connection")
  const items = await getAllAmazonInventory(c)
  let upserted = 0
  for (const item of items) {
    await prisma.currentInventory.upsert({
      where: { organizationId_asin: { organizationId, asin: item.asin } },
      create: {
        organizationId,
        asin: item.asin,
        sku: item.sellerSku,
        productName: item.productName,
        fulfillableQty: item.inventoryDetails.fulfillableQuantity,
        totalQty: item.inventoryDetails.fulfillableQuantity,
        lastUpdated: new Date(),
      },
      update: {
        sku: item.sellerSku,
        productName: item.productName,
        fulfillableQty: item.inventoryDetails.fulfillableQuantity,
        totalQty: item.inventoryDetails.fulfillableQuantity,
        lastUpdated: new Date(),
      },
    })
    upserted++
  }
  return { upserted }
}

export async function takeInventorySnapshot(organizationId: string, notes?: string) {
  const c = await getAmazonSPCredsForOrg(organizationId)
  if (!c) throw new Error("No active Amazon connection")
  const items = await getAllAmazonInventory(c)

  const snapshot = await prisma.inventorySnapshot.create({
    data: {
      organizationId,
      snapshotDate: new Date(),
      source: "sp_api",
      totalAsins: items.length,
      totalUnits: items.reduce((s, i) => s + (i.inventoryDetails.fulfillableQuantity || 0), 0),
      notes,
    },
  })

  for (const item of items) {
    await prisma.inventorySnapshotItem.create({
      data: {
        snapshotId: snapshot.id,
        asin: item.asin,
        sku: item.sellerSku,
        productName: item.productName,
        fulfillableQty: item.inventoryDetails.fulfillableQuantity,
        totalQty: item.inventoryDetails.fulfillableQuantity,
      },
    })
  }
  return snapshot
}
