import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { getQuotaSnapshot } from "@/lib/quota"

// GET /api/quota - Returns the current Gemini image-generation quota snapshot
// (used today, daily limit, remaining, resetsAt) for the UI to surface.
export async function GET() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error

  const quota = await getQuotaSnapshot()
  return NextResponse.json(quota)
}
