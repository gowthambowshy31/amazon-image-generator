import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { getReviewsSPClient } from "@/lib/reviews/sp-client"
import { checkRefunds } from "@/lib/reviews/refunds.service"

export async function POST() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = await getReviewsSPClient(result.organizationId)
  if (!sp) return NextResponse.json({ error: "No active Amazon connection" }, { status: 400 })
  const summary = await checkRefunds(sp, result.organizationId)
  return NextResponse.json(summary)
}
