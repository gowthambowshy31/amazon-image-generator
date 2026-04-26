import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getReviewsSPClient } from "@/lib/reviews/sp-client"
import { sendBatchSolicitations } from "@/lib/reviews/solicitations.service"

export async function POST() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = await getReviewsSPClient(result.organizationId)
  if (!sp) return NextResponse.json({ error: "No active Amazon connection" }, { status: 400 })

  const settings = await prisma.reviewSettings.findUnique({
    where: { organizationId: result.organizationId },
  })
  const sendAfterDays = settings?.sendAfterDays ?? 5
  const summary = await sendBatchSolicitations(sp, result.organizationId, sendAfterDays)
  return NextResponse.json(summary)
}
