import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/products/variants-summary - Get variant counts across all products
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const productIds = searchParams.get("productIds")

    const where: any = {}

    // Scope to user's organization by filtering source images to org products
    if (user.organizationId) {
      const orgProducts = await prisma.product.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true }
      })
      const orgProductIds = orgProducts.map(p => p.id)

      if (productIds) {
        // Intersect requested IDs with org-scoped IDs
        const requestedIds = productIds.split(",")
        where.productId = { in: requestedIds.filter(id => orgProductIds.includes(id)) }
      } else {
        where.productId = { in: orgProductIds }
      }
    } else if (productIds) {
      where.productId = { in: productIds.split(",") }
    }

    const variants = await prisma.sourceImage.groupBy({
      by: ["variant"],
      where,
      _count: { variant: true },
      orderBy: { _count: { variant: "desc" } }
    })

    return NextResponse.json({
      variants: variants.map(v => ({
        variant: v.variant || "UNKNOWN",
        count: v._count.variant
      }))
    })
  } catch (error) {
    console.error("Error fetching variants summary:", error)
    return NextResponse.json(
      { error: "Failed to fetch variants summary" },
      { status: 500 }
    )
  }
}
