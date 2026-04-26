import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { getEbayCredentialsForOrg } from "@/lib/channels/ebay-auth"
import { getEbayAuthorizationUrl, EBAY_SCOPES } from "@/lib/channels/ebay-client"

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const ebay = await getEbayCredentialsForOrg(result.organizationId)
  if (!ebay) {
    return NextResponse.json(
      { error: "eBay app credentials not configured. Set them in Channels Settings first." },
      { status: 400 },
    )
  }
  const url = getEbayAuthorizationUrl(ebay.creds, EBAY_SCOPES, result.organizationId)
  return NextResponse.redirect(url)
}
