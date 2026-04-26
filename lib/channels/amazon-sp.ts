import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

const REGION_ENDPOINTS = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
} as const

const TOKEN_URL = "https://api.amazon.com/auth/o2/token"

export interface AmazonSPCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  marketplace: string
  region: "na" | "eu" | "fe"
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getAccessToken(c: AmazonSPCredentials): Promise<string> {
  const cached = tokenCache.get(c.clientId)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  })
  if (!r.ok) throw new Error(`Amazon token refresh failed: ${r.status} ${await r.text()}`)
  const data = (await r.json()) as { access_token: string; expires_in: number }
  tokenCache.set(c.clientId, { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 })
  return data.access_token
}

export async function amazonApiCall<T>(
  c: AmazonSPCredentials,
  path: string,
  options: { method?: string; body?: unknown; queryParams?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAccessToken(c)
  const url = new URL(path, REGION_ENDPOINTS[c.region])
  if (options.queryParams) {
    for (const [k, v] of Object.entries(options.queryParams)) url.searchParams.set(k, v)
  }
  const r = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-amz-access-token": token,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!r.ok) throw new Error(`Amazon ${options.method ?? "GET"} ${path} failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as T
}

function safeDecrypt(v: string | null | undefined): string {
  if (!v) return ""
  try {
    return decrypt(v)
  } catch {
    return v
  }
}

export async function getAmazonSPCredsForOrg(organizationId: string): Promise<AmazonSPCredentials | null> {
  const conn = await prisma.amazonConnection.findFirst({ where: { organizationId, isActive: true } })
  if (!conn) return null
  const region = (["na", "eu", "fe"].includes(conn.region) ? conn.region : "na") as "na" | "eu" | "fe"
  return {
    clientId: conn.clientId || process.env.AMAZON_CLIENT_ID || "",
    clientSecret: conn.clientSecret ? safeDecrypt(conn.clientSecret) : process.env.AMAZON_CLIENT_SECRET || "",
    refreshToken: safeDecrypt(conn.refreshToken),
    marketplace: conn.marketplaceId || "ATVPDKIKX0DER",
    region,
  }
}

// Inventory summaries
interface InventorySummary {
  asin: string
  sellerSku: string
  inventoryDetails: { fulfillableQuantity: number }
  productName: string
}
export async function getAllAmazonInventory(c: AmazonSPCredentials): Promise<InventorySummary[]> {
  const all: InventorySummary[] = []
  let nextToken: string | undefined
  do {
    const params: Record<string, string> = {
      details: "true",
      granularityType: "Marketplace",
      granularityId: c.marketplace,
      marketplaceIds: c.marketplace,
    }
    if (nextToken) params.nextToken = nextToken
    const resp = await amazonApiCall<any>(c, "/fba/inventory/v1/summaries", { queryParams: params })
    all.push(...(resp.payload?.inventorySummaries || []))
    nextToken = resp.pagination?.nextToken
  } while (nextToken)
  return all
}

// MCF: create fulfillment order
export async function createFulfillmentOrder(
  c: AmazonSPCredentials,
  payload: {
    sellerFulfillmentOrderId: string
    displayableOrderId: string
    displayableOrderDate: string
    displayableOrderComment: string
    shippingSpeedCategory: "Standard" | "Expedited" | "Priority" | "ScheduledDelivery"
    destinationAddress: any
    items: { sellerSku: string; sellerFulfillmentOrderItemId: string; quantity: number }[]
    notificationEmails?: string[]
  },
): Promise<any> {
  return amazonApiCall(c, "/fba/outbound/2020-07-01/fulfillmentOrders", {
    method: "POST",
    body: payload,
  })
}

export async function getFulfillmentOrder(c: AmazonSPCredentials, sellerFulfillmentOrderId: string): Promise<any> {
  return amazonApiCall(c, `/fba/outbound/2020-07-01/fulfillmentOrders/${sellerFulfillmentOrderId}`)
}
