import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { encrypt } from "@/lib/encryption"

// GET /api/amazon/callback - Handle Amazon OAuth callback
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session.user.organizationId) {
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const { searchParams } = new URL(request.url)
  const spApiOauthCode = searchParams.get("spapi_oauth_code")
  const state = searchParams.get("state")
  const sellingPartnerId = searchParams.get("selling_partner_id")

  if (!spApiOauthCode || !state) {
    return NextResponse.redirect(
      new URL("/settings/amazon?error=missing_params", request.url)
    )
  }

  // Verify state parameter
  try {
    const stateData = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    )
    if (stateData.orgId !== session.user.organizationId) {
      return NextResponse.redirect(
        new URL("/settings/amazon?error=invalid_state", request.url)
      )
    }
  } catch {
    return NextResponse.redirect(
      new URL("/settings/amazon?error=invalid_state", request.url)
    )
  }

  // Exchange the authorization code for tokens
  try {
    const tokenResponse = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: spApiOauthCode,
        client_id: process.env.AMAZON_CLIENT_ID || "",
        client_secret: process.env.AMAZON_CLIENT_SECRET || "",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Token exchange failed:", errorData)
      return NextResponse.redirect(
        new URL("/settings/amazon?error=token_exchange_failed", request.url)
      )
    }

    const tokens = await tokenResponse.json()
    const { access_token, refresh_token } = tokens

    if (!refresh_token) {
      return NextResponse.redirect(
        new URL("/settings/amazon?error=no_refresh_token", request.url)
      )
    }

    // Encrypt and store the tokens
    const encryptedRefreshToken = encrypt(refresh_token)

    // Upsert the Amazon connection for this org
    await prisma.amazonConnection.upsert({
      where: {
        organizationId_sellerId: {
          organizationId: session.user.organizationId,
          sellerId: sellingPartnerId || "unknown",
        },
      },
      update: {
        refreshToken: encryptedRefreshToken,
        accessToken: access_token || null,
        tokenExpiresAt: access_token
          ? new Date(Date.now() + 3600 * 1000) // access tokens last ~1 hour
          : null,
        isActive: true,
      },
      create: {
        organizationId: session.user.organizationId,
        sellerId: sellingPartnerId || "unknown",
        refreshToken: encryptedRefreshToken,
        accessToken: access_token || null,
        tokenExpiresAt: access_token
          ? new Date(Date.now() + 3600 * 1000)
          : null,
        isActive: true,
      },
    })

    return NextResponse.redirect(
      new URL("/settings/amazon?success=connected", request.url)
    )
  } catch (error) {
    console.error("Amazon OAuth callback error:", error)
    return NextResponse.redirect(
      new URL("/settings/amazon?error=server_error", request.url)
    )
  }
}
