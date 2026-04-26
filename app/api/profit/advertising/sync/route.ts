import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { createAllReports } from "@/lib/profit/ads-queue"
import { format, subDays } from "date-fns"

/**
 * Kick off a parallel ads sync. Submits SP / SD / SB reports to Amazon and
 * returns immediately with a batchId. The poll cron downloads + processes
 * them as they complete (10-20 min later).
 */
export async function POST(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error

  const body = await req.json().catch(() => ({}))
  const days = typeof body.days === "number" ? body.days : 7
  const reportTypes: string[] | undefined = Array.isArray(body.reportTypes)
    ? body.reportTypes
    : undefined

  // Default range: from `days` ago up to yesterday
  const startDate = format(subDays(new Date(), days), "yyyy-MM-dd")
  const endDate = format(subDays(new Date(), 1), "yyyy-MM-dd")

  try {
    const summary = await createAllReports(
      result.organizationId,
      startDate,
      endDate,
      reportTypes,
    )
    return NextResponse.json({
      ...summary,
      message:
        summary.reportsCreated > 0
          ? `Submitted ${summary.reportsCreated} reports. Poll cron will download them in 10–20 min.`
          : "No reports submitted",
      startDate,
      endDate,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
