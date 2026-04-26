import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { getQueueStatus } from "@/lib/profit/ads-queue"

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const queue = await getQueueStatus(result.organizationId)
  return NextResponse.json({ queue })
}
