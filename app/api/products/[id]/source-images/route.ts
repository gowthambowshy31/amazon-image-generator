import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

/**
 * GET /api/products/[id]/source-images
 * Get all source images for a product
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Verify product exists and belongs to user's org
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    if (user.organizationId && product.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const sourceImages = await prisma.sourceImage.findMany({
      where: {
        productId: id
      },
      orderBy: {
        imageOrder: 'asc'
      }
    })

    return NextResponse.json(sourceImages)
  } catch (error) {
    console.error("Error fetching source images:", error)
    return NextResponse.json(
      { error: "Failed to fetch source images" },
      { status: 500 }
    )
  }
}
