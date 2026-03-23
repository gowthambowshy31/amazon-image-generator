import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

/**
 * GET /api/amazon/push-history?productId=xxx
 * Get Amazon push history for a product
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')

    if (!productId) {
      return NextResponse.json({ error: "productId query parameter is required" }, { status: 400 })
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, asin: true, title: true }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Get push history with related image info
    const history = await prisma.amazonImagePush.findMany({
      where: { productId },
      include: {
        generatedImage: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            templateName: true,
            status: true,
            imageType: {
              select: { name: true }
            },
            template: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      productId,
      asin: product.asin,
      productTitle: product.title,
      history: history.map(record => ({
        id: record.id,
        amazonSlot: record.amazonSlot,
        imageUrl: record.imageUrl,
        status: record.status,
        errorMessage: record.errorMessage,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
        generatedImage: record.generatedImage ? {
          id: record.generatedImage.id,
          fileName: record.generatedImage.fileName,
          name: record.generatedImage.templateName
            || record.generatedImage.template?.name
            || record.generatedImage.imageType?.name
            || 'Generated Image'
        } : null
      })),
      totalPushes: history.length,
      successfulPushes: history.filter(h => h.status === 'SUCCESS').length,
      failedPushes: history.filter(h => h.status === 'FAILED').length
    })
  } catch (error) {
    console.error("Error fetching push history:", error)
    return NextResponse.json(
      { error: "Failed to fetch push history", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
