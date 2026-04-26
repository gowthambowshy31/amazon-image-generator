import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const reports = await prisma.profitReport.findMany({
    where: { organizationId: result.organizationId },
    orderBy: { uploadedAt: "desc" },
    take: 50,
  })
  return NextResponse.json(reports)
}
