import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncChannelInventory } from "@/lib/channels/inventory-sync"
import { pollEbayOrders, syncMcfTracking } from "@/lib/channels/order-routing"

export const maxDuration = 300
export const dynamic = "force-dynamic"

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  return provided === secret
}

// Run all channels-module sync tasks for every active org
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgs = await prisma.organization.findMany({
    include: {
      channelsSyncConfig: true,
      amazonConnections: { where: { isActive: true } },
      ebayConnections: { where: { isActive: true } },
    },
  })

  const results: any[] = []
  for (const org of orgs) {
    if (org.amazonConnections.length === 0 || org.ebayConnections.length === 0) continue
    const cfg = org.channelsSyncConfig
    if (cfg && !cfg.autoSyncEnabled) {
      results.push({ org: org.slug, skipped: "autoSyncEnabled = false" })
      continue
    }
    try {
      const inv = await syncChannelInventory(org.id)
      const polled = await pollEbayOrders(org.id)
      const tracking = await syncMcfTracking(org.id)
      results.push({ org: org.slug, inventory: inv, ordersPolled: polled, tracking })
    } catch (e: any) {
      results.push({ org: org.slug, error: e?.message || String(e) })
    }
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), results })
}
