import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

const ADS_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
const ADS_REGIONS = {
  na: "https://advertising-api.amazon.com",
  eu: "https://advertising-api-eu.amazon.com",
  fe: "https://advertising-api-fe.amazon.com",
} as const

export interface AdsCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  profileId: string
  region: "na" | "eu" | "fe"
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

function safeDecrypt(v: string | null | undefined): string {
  if (!v) return ""
  try { return decrypt(v) } catch { return v }
}

export async function getAdsAccessToken(c: AdsCredentials): Promise<string> {
  const key = `${c.clientId}:${c.refreshToken.slice(-8)}`
  const cached = tokenCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const r = await fetch(ADS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  })
  if (!r.ok) throw new Error(`Ads token refresh failed: ${r.status} ${await r.text()}`)
  const data = (await r.json()) as { access_token: string; expires_in: number }
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 })
  return data.access_token
}

export async function adsApiCall<T>(
  c: AdsCredentials,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAdsAccessToken(c)
  const url = `${ADS_REGIONS[c.region]}${path}`
  const r = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": c.clientId,
      "Amazon-Advertising-API-Scope": c.profileId,
      "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
      Accept: "application/vnd.createasyncreportresponse.v3+json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!r.ok) throw new Error(`Ads API ${options.method ?? "GET"} ${path} failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as T
}

export async function getAdsCredsForOrg(organizationId: string): Promise<AdsCredentials | null> {
  const conn = await prisma.amazonAdsConnection.findFirst({ where: { organizationId, isActive: true } })
  if (!conn) return null
  const region = (["na", "eu", "fe"].includes(conn.region) ? conn.region : "na") as "na" | "eu" | "fe"
  return {
    clientId: conn.clientId ? safeDecrypt(conn.clientId) : process.env.AMAZON_ADS_CLIENT_ID || "",
    clientSecret: conn.clientSecret ? safeDecrypt(conn.clientSecret) : process.env.AMAZON_ADS_CLIENT_SECRET || "",
    refreshToken: safeDecrypt(conn.refreshToken),
    profileId: conn.profileId,
    region,
  }
}
