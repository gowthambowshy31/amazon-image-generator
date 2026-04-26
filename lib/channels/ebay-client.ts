// Lifted from amazon-ebay-mcf-sync. eBay OAuth + REST helpers, parameterized by per-org credentials.

const EBAY_ENDPOINTS = {
  sandbox: { auth: "https://auth.sandbox.ebay.com", api: "https://api.sandbox.ebay.com" },
  production: { auth: "https://auth.ebay.com", api: "https://api.ebay.com" },
} as const

export interface EbayCredentials {
  clientId: string
  clientSecret: string
  devId?: string
  redirectUri: string
  environment: "sandbox" | "production"
}

export interface EbayTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  refresh_token?: string
  refresh_token_expires_in?: number
}

function basicAuth(c: EbayCredentials) {
  return Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")
}
function endpoints(env: "sandbox" | "production") {
  return EBAY_ENDPOINTS[env]
}

export function getEbayAuthorizationUrl(c: EbayCredentials, scopes: string[], state?: string): string {
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
  })
  if (state) params.set("state", state)
  return `${endpoints(c.environment).auth}/oauth2/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(c: EbayCredentials, code: string): Promise<EbayTokenResponse> {
  const r = await fetch(`${endpoints(c.environment).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(c)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: c.redirectUri,
    }),
  })
  if (!r.ok) throw new Error(`eBay token exchange failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as EbayTokenResponse
}

export async function refreshUserToken(c: EbayCredentials, refreshToken: string, scopes: string[]): Promise<EbayTokenResponse> {
  const r = await fetch(`${endpoints(c.environment).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(c)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    }),
  })
  if (!r.ok) throw new Error(`eBay token refresh failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as EbayTokenResponse
}

export async function ebayApiCall<T>(
  c: EbayCredentials,
  token: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${endpoints(c.environment).api}${path}`
  const r = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
      Accept: "application/json",
      "Accept-Language": "en-US",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`eBay ${options.method ?? "GET"} ${path} failed: ${r.status} ${txt}`)
  }
  const text = await r.text()
  if (!text) return {} as T
  return JSON.parse(text) as T
}

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
]
