import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const page = parseInt(sp.get("page") || "1", 10)
  const limit = parseInt(sp.get("limit") || "50", 10)
  const search = sp.get("search") || ""
  const where: any = { organizationId: result.organizationId }
  if (search) {
    where.OR = [
      { amazonSku: { contains: search, mode: "insensitive" } },
      { amazonAsin: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.channelSku.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.channelSku.count({ where }),
  ])
  return NextResponse.json({ items, total, page, limit })
}
