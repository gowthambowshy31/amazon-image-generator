import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { getAmazonSPClient } from "@/lib/amazon-sp"
import { downloadAndStoreImage } from "@/lib/image-storage"

/**
 * POST /api/products/[id]/refresh-images
 * Refreshes product images from Amazon API
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Get product from database
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        sourceImages: true
      }
    })

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      )
    }

    if (user.organizationId && product.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      )
    }

    if (!product.asin) {
      return NextResponse.json(
        { error: "Product does not have an ASIN" },
        { status: 400 }
      )
    }

    // Fetch product from Amazon
    const amazonSP = getAmazonSPClient()
    const amazonProduct = await amazonSP.getProductByASIN(product.asin)

    if (!amazonProduct) {
      return NextResponse.json(
        { error: "Product not found on Amazon" },
        { status: 404 }
      )
    }

    const currentImageCount = product.sourceImages.length
    const amazonImageCount = amazonProduct.images.length

    // Delete existing source images
    await prisma.sourceImage.deleteMany({
      where: { productId: product.id }
    })

    // Download and save all images
    const sourceImages = []
    const errors: string[] = []

    for (let i = 0; i < amazonProduct.images.length; i++) {
      const amazonImage = amazonProduct.images[i]

      try {
        const downloadResult = await downloadAndStoreImage({
          url: amazonImage.link,
          productId: product.id,
          variant: amazonImage.variant,
          order: i
        })

        if (downloadResult.success) {
          const sourceImage = await prisma.sourceImage.create({
            data: {
              productId: product.id,
              amazonImageUrl: amazonImage.link,
              localFilePath: downloadResult.filePath,
              imageOrder: i,
              width: downloadResult.width,
              height: downloadResult.height,
              fileSize: downloadResult.fileSize,
              variant: amazonImage.variant
            }
          })

          sourceImages.push(sourceImage)
        } else {
          errors.push(`Failed to download image ${i + 1}`)
        }
      } catch (error) {
        console.error(`Failed to download image ${i}:`, error)
        errors.push(`Error downloading image ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        // Continue with other images
      }
    }

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        asin: product.asin,
        title: product.title
      },
      summary: {
        previousImageCount: currentImageCount,
        amazonImageCount: amazonImageCount,
        importedImageCount: sourceImages.length,
        imagesAdded: sourceImages.length - currentImageCount,
        errors: errors.length > 0 ? errors : undefined
      },
      sourceImages: sourceImages.map(img => ({
        id: img.id,
        variant: img.variant,
        imageOrder: img.imageOrder,
        width: img.width,
        height: img.height
      }))
    })
  } catch (error) {
    console.error("Error refreshing product images:", error)
    return NextResponse.json(
      {
        error: "Failed to refresh product images",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
