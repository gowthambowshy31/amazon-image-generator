import { NextRequest, NextResponse } from "next/server"
import { drainQueue } from "@/lib/drain-queue"
import { getQuotaSnapshot } from "@/lib/quota"

export const maxDuration = 300

/**
 * Token-gated drain endpoint for external schedulers (EC2 crontab, EventBridge,
 * uptime pingers, etc.). Set CRON_SECRET in .env, then configure the scheduler
 * to hit `GET /api/cron/drain?token=<secret>` once a day just after PT midnight.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const provided =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const result = await drainQueue()
  const quota = await getQuotaSnapshot()
  return NextResponse.json({ ok: true, ...result, quota })
}
