import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { pollEbayOrders } from "@/lib/channels/order-routing"

export async function POST() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  try {
    const summary = await pollEbayOrders(result.organizationId)
    return NextResponse.json(summary)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
