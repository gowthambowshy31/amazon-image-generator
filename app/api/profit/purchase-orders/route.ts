import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  poNumber: z.string().optional(),
  factoryName: z.string().min(1),
  status: z.string().default("DRAFT"),
  orderDate: z.string().datetime().optional(),
  expectedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
})

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const pos = await prisma.purchaseOrder.findMany({
    where: { organizationId: result.organizationId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return NextResponse.json(pos)
}

export async function POST(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const body = await req.json()
  const data = createSchema.parse(body)

  const poNumber = data.poNumber || `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
  const po = await prisma.purchaseOrder.create({
    data: {
      organizationId: result.organizationId,
      poNumber,
      factoryName: data.factoryName,
      status: data.status,
      orderDate: data.orderDate ? new Date(data.orderDate) : null,
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      notes: data.notes,
    },
  })
  return NextResponse.json(po, { status: 201 })
}
