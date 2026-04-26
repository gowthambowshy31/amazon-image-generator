import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const page = parseInt(sp.get("page") || "1", 10)
  const limit = parseInt(sp.get("limit") || "50", 10)

  const [items, total, claims] = await Promise.all([
    prisma.reimbursement.findMany({
      where: { organizationId: result.organizationId },
      orderBy: { approvalDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reimbursement.count({ where: { organizationId: result.organizationId } }),
    prisma.potentialClaim.findMany({
      where: { organizationId: result.organizationId, status: { in: ["DETECTED", "FILED"] } },
      orderBy: { claimDeadline: "asc" },
      take: 50,
    }),
  ])

  const totalAmount = await prisma.reimbursement.aggregate({
    where: { organizationId: result.organizationId },
    _sum: { amountTotal: true },
  })

  return NextResponse.json({
    reimbursements: items,
    total,
    page,
    limit,
    potentialClaims: claims,
    totalAmount: totalAmount._sum.amountTotal || 0,
  })
}
