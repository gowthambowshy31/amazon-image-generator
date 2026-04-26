import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { refreshCurrentInventory } from "@/lib/profit/sp-inventory"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const items = await prisma.currentInventory.findMany({
    where: { organizationId: result.organizationId },
    orderBy: { totalQty: "desc" },
    take: 500,
  })
  return NextResponse.json({ items })
}

export async function POST() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  try {
    const summary = await refreshCurrentInventory(result.organizationId)
    return NextResponse.json(summary)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
