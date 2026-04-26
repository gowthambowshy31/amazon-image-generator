import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { listSolicitations } from "@/lib/reviews/solicitations.service"

export async function GET(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const sp = req.nextUrl.searchParams
  const data = await listSolicitations(result.organizationId, {
    page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
    limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
    status: sp.get("status") || undefined,
  })
  return NextResponse.json(data)
}
