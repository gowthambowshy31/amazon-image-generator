import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  asin: z.string().optional(),
  productName: z.string().optional(),
  description: z.string().optional(),
  estimatedValue: z.number().optional(),
  claimType: z.string().optional(),
  amazonOrderId: z.string().optional(),
  referenceId: z.string().optional(),
  incidentDate: z.string().datetime().optional(),
  claimDeadline: z.string().datetime().optional(),
  status: z.string().default("pending"),
  notes: z.string().optional(),
})

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const claims = await prisma.reimbursementClaim.findMany({
    where: { organizationId: result.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return NextResponse.json(claims)
}

export async function POST(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const body = await req.json()
  const data = createSchema.parse(body)
  const claim = await prisma.reimbursementClaim.create({
    data: {
      organizationId: result.organizationId,
      userId: result.user.id,
      ...data,
      incidentDate: data.incidentDate ? new Date(data.incidentDate) : null,
      claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : null,
    },
  })
  return NextResponse.json(claim, { status: 201 })
}
