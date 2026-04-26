import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncAdsDaily } from "@/lib/profit/ads-sync"
import { refreshCurrentInventory } from "@/lib/profit/sp-inventory"

export const maxDuration = 600
export const dynamic = "force-dynamic"

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  return provided === secret
}

// Run profit-module syncs for every active org
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

  const results: any[] = []
  for (const org of orgs) {
    const hasSp = org.amazonConnections.length > 0 || hasEnvSp
    const hasAds = org.amazonAdsConnections.length > 0 || hasEnvAds
    if (!hasSp && !hasAds) continue
    const orgRes: any = { org: org.slug }
    try {
      if (hasSp) orgRes.inventory = await refreshCurrentInventory(org.id)
      if (hasAds) orgRes.ads = await syncAdsDaily(org.id, 7)
    } catch (e: any) {
      orgRes.error = e?.message || String(e)
    }
    results.push(orgRes)
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), results })
}
