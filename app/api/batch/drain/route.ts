import { NextRequest, NextResponse } from "next/server"
import { drainQueue, queueFailedForBatch } from "@/lib/drain-queue"
import { getQuotaSnapshot } from "@/lib/quota"
import { prisma } from "@/lib/prisma"

export const maxDuration = 300 // seconds — long-running drain

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const maxItems = typeof body?.maxItems === "number" ? body.maxItems : undefined
  const gapMs = typeof body?.gapMs === "number" ? body.gapMs : undefined
  const backfillBatch = typeof body?.backfillBatch === "string" ? body.backfillBatch : undefined
  const drain = body?.drain !== false // default true

  let backfill: { queued: number; skipped: number; reason?: string } | undefined
  if (backfillBatch) {
    backfill = await queueFailedForBatch(backfillBatch)
  }

  const drainResult = drain
    ? await drainQueue({ maxItems, gapMs })
    : { attempted: 0, succeeded: 0, failed: 0, stoppedOnQuota: false, errors: [] }
  const quota = await getQuotaSnapshot()
  return NextResponse.json({ ...drainResult, backfill, quota })
}

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batch")

  const where = batchId ? { batchId } : undefined
  const [queued, running, completed, failed] = await Promise.all([
    prisma.queuedRegeneration.count({ where: { ...where, status: "QUEUED" } }),
    prisma.queuedRegeneration.count({ where: { ...where, status: "RUNNING" } }),
    prisma.queuedRegeneration.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.queuedRegeneration.count({ where: { ...where, status: "FAILED" } }),
  ])
  const quota = await getQuotaSnapshot()
  return NextResponse.json({
    batchId: batchId || null,
    queued,
    running,
    completed,
    failed,
    quota,
  })
}
