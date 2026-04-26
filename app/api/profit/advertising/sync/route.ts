import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { syncAdsDaily } from "@/lib/profit/ads-sync"

export async function POST(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const body = await req.json().catch(() => ({}))
  const days = typeof body.days === "number" ? body.days : 7
  try {
    const summary = await syncAdsDaily(result.organizationId, days)
    return NextResponse.json(summary)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
