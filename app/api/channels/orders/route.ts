import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const page = parseInt(sp.get("page") || "1", 10)
  const limit = parseInt(sp.get("limit") || "50", 10)
  const status = sp.get("status") || undefined
  const where: any = { organizationId: result.organizationId }
  if (status) where.status = status

  const [items, total] = await Promise.all([
    prisma.mcfOrder.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.mcfOrder.count({ where }),
  ])
  return NextResponse.json({ items, total, page, limit })
}
