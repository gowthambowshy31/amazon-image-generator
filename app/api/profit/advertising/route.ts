import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const days = parseInt(sp.get("days") || "30", 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [daily, campaigns] = await Promise.all([
    prisma.adPerformanceDaily.findMany({
      where: { organizationId: result.organizationId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.adCampaignDaily.findMany({
      where: { organizationId: result.organizationId, date: { gte: since } },
      orderBy: { date: "desc" },
      take: 200,
    }),
  ])

  const summary = daily.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      spend: acc.spend + row.spend,
      adSales7d: acc.adSales7d + row.adSales7d,
    }),
    { impressions: 0, clicks: 0, spend: 0, adSales7d: 0 },
  )

  return NextResponse.json({ daily, campaigns, summary })
}
