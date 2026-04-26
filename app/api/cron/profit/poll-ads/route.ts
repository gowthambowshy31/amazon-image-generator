import { NextRequest, NextResponse } from "next/server"
import { pollPendingReports } from "@/lib/profit/ads-queue"

export const maxDuration = 300
export const dynamic = "force-dynamic"

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  return provided === secret
}

// Every-5-min poller: checks Amazon for completed reports, downloads them,
// and processes batches once all rows in a batch have arrived.
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const summary = await pollPendingReports()
    return NextResponse.json({ ranAt: new Date().toISOString(), ...summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
