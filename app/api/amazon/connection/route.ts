import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/amazon/connection - Get current Amazon connection status
export async function GET() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  if (!user.organizationId) {
    return NextResponse.json({ connected: false, connections: [] })
  }

  const connections = await prisma.amazonConnection.findMany({
    where: { organizationId: user.organizationId },
    select: {
      id: true,
      sellerId: true,
      marketplaceId: true,
      region: true,
      storeName: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    connected: connections.some((c) => c.isActive),
    connections,
  })
}

// DELETE /api/amazon/connection - Disconnect an Amazon account
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get("id")

  if (connectionId) {
    // Disconnect specific connection
    await prisma.amazonConnection.updateMany({
      where: { id: connectionId, organizationId: user.organizationId },
      data: { isActive: false },
    })
  } else {
    // Disconnect all
    await prisma.amazonConnection.updateMany({
      where: { organizationId: user.organizationId },
      data: { isActive: false },
    })
  }

  return NextResponse.json({ message: "Disconnected" })
}
