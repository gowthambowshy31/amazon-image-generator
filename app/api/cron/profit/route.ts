import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { refreshCurrentInventory } from "@/lib/profit/sp-inventory"
import { createAllReports } from "@/lib/profit/ads-queue"
import { format, subDays } from "date-fns"

export const maxDuration = 300
export const dynamic = "force-dynamic"

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  return provided === secret
}

/**
 * Daily Profit cron:
 * 1. Refresh live FBA inventory for each org with an SP-API connection.
 * 2. Submit ads reports (SP/SD/SB) to Amazon for each org with Ads creds.
 *    These are async — actual download + processing happens in /api/cron/profit/poll-ads
 *    which runs every 5 minutes.
 */
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgs = await prisma.organization.findMany({
    include: {
      amazonConnections: { where: { isActive: true } },
      amazonAdsConnections: { where: { isActive: true } },
    },
  })

  const hasEnvAds =
    !!process.env.AMAZON_ADS_CLIENT_ID &&
    !!process.env.AMAZON_ADS_CLIENT_SECRET &&
    !!process.env.AMAZON_ADS_REFRESH_TOKEN &&
    !!process.env.AMAZON_ADS_PROFILE_ID
  const hasEnvSp = !!process.env.AMAZON_REFRESH_TOKEN

  // Default ads window: last 7 days, ending yesterday
  const adsStart = format(subDays(new Date(), 7), "yyyy-MM-dd")
  const adsEnd = format(subDays(new Date(), 1), "yyyy-MM-dd")

  const results: any[] = []
  for (const org of orgs) {
    const hasSp = org.amazonConnections.length > 0 || hasEnvSp
    const hasAds = org.amazonAdsConnections.length > 0 || hasEnvAds
    if (!hasSp && !hasAds) continue
    const orgRes: any = { org: org.slug }
    try {
      if (hasSp) orgRes.inventory = await refreshCurrentInventory(org.id)
      if (hasAds) {
        // Submit reports only — they will be polled & processed by /api/cron/profit/poll-ads
        orgRes.adsSubmit = await createAllReports(org.id, adsStart, adsEnd)
      }
    } catch (e: any) {
      orgRes.error = e?.message || String(e)
    }
    results.push(orgRes)
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), results })
}
