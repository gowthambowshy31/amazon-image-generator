import { NextRequest, NextResponse } from "next/server"
import { authenticateApiKey } from "@/lib/api-key-auth"

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth.error) return auth.error
  return NextResponse.json({
    id: auth.user.id,
    email: auth.user.email,
    name: auth.user.name,
    role: auth.user.role,
    organizationId: auth.user.organizationId,
  })
}
