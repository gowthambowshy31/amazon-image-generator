import { NextRequest, NextResponse } from "next/server"
import { drainQueue } from "@/lib/drain-queue"
import { getQuotaSnapshot } from "@/lib/quota"
import { prisma } from "@/lib/prisma"

export const maxDuration = 300 // seconds — long-running drain

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const maxItems = typeof body?.maxItems === "number" ? body.maxItems : undefined
  const gapMs = typeof body?.gapMs === "number" ? body.gapMs : undefined

  const result = await drainQueue({ maxItems, gapMs })
  const quota = await getQuotaSnapshot()
  return NextResponse.json({ ...result, quota })
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
