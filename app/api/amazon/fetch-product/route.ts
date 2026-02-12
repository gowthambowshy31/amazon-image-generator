import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient } from "@/lib/amazon-sp"
import { downloadAndStoreImage } from "@/lib/image-storage"
import { z } from "zod"

const fetchProductSchema = z.object({
  asin: z.string().min(10).max(10),
  autoCreateProduct: z.boolean().optional().default(false)
})

/**
 * POST /api/amazon/fetch-product
 * Fetches product details and images from Amazon by ASIN
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { asin, autoCreateProduct } = fetchProductSchema.parse(body)

    // Fetch product from Amazon
    const amazonSP = getAmazonSPClient()
    const amazonProduct = await amazonSP.getProductByASIN(asin)

    if (!amazonProduct) {
      return NextResponse.json(
        { error: "Product not found on Amazon" },
        { status: 404 }
      )
    }

    // Check if product already exists in database
    let product = await prisma.product.findUnique({
      where: { asin },
      include: {
        sourceImages: true
      }
    })

    // Create product if requested and doesn't exist
    if (!product && autoCreateProduct) {
      // Get default admin user
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      })

      // Try to get the Seller SKU from Amazon inventory
      let sellerSku: string | null = null
      try {
        sellerSku = await amazonSP.getSellerSKUByASIN(asin)
      } catch (skuErr) {
        console.warn('Could not fetch SKU from inventory:', skuErr)
      }

      product = await prisma.product.create({
        data: {
          asin,
          title: amazonProduct.title,
          category: amazonProduct.productType || amazonProduct.brand,
          metadata: {
            brand: amazonProduct.brand,
            manufacturer: amazonProduct.manufacturer,
            productType: amazonProduct.productType,
            ...(sellerSku ? { sku: sellerSku } : {}),
            attributes: amazonProduct.attributes
          },
          createdById: adminUser?.id || 'system'
        },
        include: {
          sourceImages: true
        }
      })

      // Log activity (optional)
      if (adminUser) {
        await prisma.activityLog.create({
          data: {
            userId: adminUser.id,
            action: "FETCH_AMAZON_PRODUCT",
            entityType: "Product",
            entityId: product.id,
            metadata: {
              asin,
              title: amazonProduct.title
            }
          }
        })
      }
    }

    // Download and store source images if product exists
    if (product) {
      // Delete existing source images
      await prisma.sourceImage.deleteMany({
        where: { productId: product.id }
      })

      // Download and save each image
      const sourceImages = []
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
          }
        } catch (error) {
          console.error(`Failed to download image ${i}:`, error)
          // Continue with other images
        }
      }

      product.sourceImages = sourceImages
    }

    return NextResponse.json({
      product,
      amazonData: amazonProduct
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error fetching product from Amazon:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch product from Amazon",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
