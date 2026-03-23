import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import crypto from "crypto"

// GET /api/amazon/authorize - Start Amazon OAuth flow
export async function GET() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated with this account" },
      { status: 403 }
    )
  }

  const appId = process.env.AMAZON_SP_APP_ID
  if (!appId) {
    return NextResponse.json(
      { error: "AMAZON_SP_APP_ID environment variable is not configured" },
      { status: 500 }
    )
  }

  // Generate a state parameter for CSRF protection
  // Encode the organizationId so we can use it in the callback
  const stateData = JSON.stringify({
    orgId: user.organizationId,
    nonce: crypto.randomBytes(16).toString("hex"),
  })
  const state = Buffer.from(stateData).toString("base64url")

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/amazon/callback`

  // Amazon SP-API authorization URL
  const authUrl = new URL("https://sellercentral.amazon.com/apps/authorize/consent")
  authUrl.searchParams.set("application_id", appId)
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("version", "beta")

  return NextResponse.json({ authUrl: authUrl.toString() })
}
