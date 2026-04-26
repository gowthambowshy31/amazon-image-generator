import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { refreshUserToken, EBAY_SCOPES, type EbayCredentials } from "./ebay-client"

function safeDecrypt(v: string | null | undefined): string {
  if (!v) return ""
  try {
    return decrypt(v)
  } catch {
    return v
  }
}

export async function getEbayCredentialsForOrg(organizationId: string): Promise<{ creds: EbayCredentials; connectionId: string } | null> {
  const conn = await prisma.ebayConnection.findFirst({
    where: { organizationId, isActive: true },
  })
  if (!conn || !conn.clientId || !conn.clientSecret || !conn.redirectUri) return null
  return {
    connectionId: conn.id,
    creds: {
      clientId: safeDecrypt(conn.clientId),
      clientSecret: safeDecrypt(conn.clientSecret),
      devId: conn.devId || undefined,
      redirectUri: conn.redirectUri,
      environment: (conn.environment === "sandbox" ? "sandbox" : "production") as "sandbox" | "production",
    },
  }
}

export async function getValidEbayToken(organizationId: string): Promise<{ token: string; creds: EbayCredentials; connectionId: string } | null> {
  const result = await getEbayCredentialsForOrg(organizationId)
  if (!result) return null

  const conn = await prisma.ebayConnection.findUnique({ where: { id: result.connectionId } })
  if (!conn?.refreshToken) return null

  if (
    conn.accessToken &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return { token: safeDecrypt(conn.accessToken), creds: result.creds, connectionId: result.connectionId }
  }

  const refresh = safeDecrypt(conn.refreshToken)
  const tok = await refreshUserToken(result.creds, refresh, EBAY_SCOPES)
  await prisma.ebayConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: tok.access_token,
      tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
    },
  })

  return { token: tok.access_token, creds: result.creds, connectionId: result.connectionId }
}
