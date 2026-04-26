import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getReviewsSPClient } from "@/lib/reviews/sp-client"
import { syncReviewOrders } from "@/lib/reviews/orders.service"
import { checkRefunds } from "@/lib/reviews/refunds.service"
import { refreshEligibility, sendBatchSolicitations } from "@/lib/reviews/solicitations.service"

export const maxDuration = 300
export const dynamic = "force-dynamic"

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  return provided === secret
}

// Daily review automation: sync orders → refunds → refresh eligibility → send batch
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgs = await prisma.organization.findMany({
    include: { reviewSettings: true, amazonConnections: { where: { isActive: true } } },
  })

  const results: any[] = []
  for (const org of orgs) {
    if (org.amazonConnections.length === 0) continue
    const settings = org.reviewSettings
    if (settings && !settings.autoSolicitEnabled) {
      results.push({ org: org.slug, skipped: "autoSolicitEnabled = false" })
      continue
    }

    try {
      const sp = await getReviewsSPClient(org.id)
      if (!sp) {
        results.push({ org: org.slug, error: "No active connection" })
        continue
      }

      const ordersResult = await syncReviewOrders(sp, org.id)
      const refundsResult = await checkRefunds(sp, org.id)
      const eligibilityResult = await refreshEligibility(sp, org.id)
      const batchResult = await sendBatchSolicitations(sp, org.id, settings?.sendAfterDays ?? 5)

      results.push({ org: org.slug, ordersResult, refundsResult, eligibilityResult, batchResult })
    } catch (e: any) {
      results.push({ org: org.slug, error: e?.message || String(e) })
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results })
}
