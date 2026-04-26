import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { listReviewOrders } from "@/lib/reviews/orders.service"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const data = await listReviewOrders(result.organizationId, {
    page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
    limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
    status: sp.get("status") || undefined,
    eligible: sp.get("eligible") || undefined,
    refunded: sp.get("refunded") || undefined,
    search: sp.get("search") || undefined,
  })
  return NextResponse.json(data)
}
