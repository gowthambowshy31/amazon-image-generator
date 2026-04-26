import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeCodeForToken } from "@/lib/channels/ebay-client"
import { getEbayCredentialsForOrg } from "@/lib/channels/ebay-auth"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state") // organizationId
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  const ebay = await getEbayCredentialsForOrg(state)
  if (!ebay) return NextResponse.json({ error: "eBay app not configured" }, { status: 400 })

  try {
    const tok = await exchangeCodeForToken(ebay.creds, code)
    await prisma.ebayConnection.update({
      where: { id: ebay.connectionId },
      data: {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
      },
    })
    return NextResponse.redirect(new URL("/channels/settings?connected=ebay", req.url))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to exchange code" }, { status: 500 })
  }
}
