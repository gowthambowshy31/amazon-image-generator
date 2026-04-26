import { ebayApiCall, type EbayCredentials } from "./ebay-client"

export async function getInventoryItem(c: EbayCredentials, token: string, sku: string): Promise<any> {
  return ebayApiCall(c, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`)
}

export async function updateInventoryQuantity(
  c: EbayCredentials,
  token: string,
  sku: string,
  quantity: number,
): Promise<void> {
  const existing = await getInventoryItem(c, token, sku).catch(() => null)
  await ebayApiCall<void>(c, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    body: {
      ...(existing || {
        product: { title: sku, description: "Synced from Amazon", imageUrls: [], aspects: { Brand: ["Generic"] } },
      }),
      availability: { shipToLocationAvailability: { quantity } },
    },
  })
}
