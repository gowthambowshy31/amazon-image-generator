import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { takeInventorySnapshot } from "@/lib/profit/sp-inventory"

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { organizationId: result.organizationId },
    orderBy: { snapshotDate: "desc" },
    take: 50,
  })
  return NextResponse.json(snapshots)
}

export async function POST() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  try {
    const snapshot = await takeInventorySnapshot(result.organizationId)
    return NextResponse.json(snapshot, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
