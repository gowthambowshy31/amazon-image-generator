import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient, ImageSlotMapping } from "@/lib/amazon-sp"
import { getPublicS3Url } from "@/lib/s3"
import { downloadAndStoreImage } from "@/lib/image-storage"
import { z } from "zod"

const pushImagesSchema = z.object({
  productId: z.string(),
  images: z.array(z.object({
    generatedImageId: z.string(),
    amazonSlot: z.enum(['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06', 'PT07', 'PT08'])
  })).min(1).max(9)
})

/**
 * POST /api/amazon/push-images
 * Push selected generated images to Amazon listing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, images } = pushImagesSchema.parse(body)

    // Get product with ASIN and metadata
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: {
          where: {
            id: { in: images.map(i => i.generatedImageId) }
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (!product.asin) {
      return NextResponse.json({ error: "Product has no ASIN - cannot push to Amazon" }, { status: 400 })
    }

    // Validate all images exist
    const imageIds = images.map(i => i.generatedImageId)
    const foundImages = product.images

    if (foundImages.length !== imageIds.length) {
      const missingIds = imageIds.filter(id => !foundImages.find(img => img.id === id))
      return NextResponse.json({
        error: "Some images not found",
        missingIds
      }, { status: 400 })
    }

    // Validate all images are APPROVED
    const nonApproved = foundImages.filter(img => img.status !== 'APPROVED')
    if (nonApproved.length > 0) {
      return NextResponse.json({
        error: "All images must be APPROVED before pushing to Amazon",
        nonApprovedImages: nonApproved.map(i => ({
          id: i.id,
          fileName: i.fileName,
          status: i.status
        }))
      }, { status: 400 })
    }

    // Get SKU and product type from metadata
    const metadata = product.metadata as any
    let productType = metadata?.productType || 'PRODUCT'

    // SKU resolution: metadata > fetch from Amazon inventory > ASIN fallback
    let sku = metadata?.sku
    if (!sku) {
      console.log(`No SKU in product metadata for ASIN ${product.asin}, fetching from Amazon inventory...`)
      const amazonSPForSku = getAmazonSPClient()
      const fetchedSku = await amazonSPForSku.getSellerSKUByASIN(product.asin!)
      if (fetchedSku) {
        sku = fetchedSku

        // Also fetch listing to get correct productType
        let fetchedProductType: string | undefined
        try {
          const listing = await amazonSPForSku.getListingItem(fetchedSku)
          fetchedProductType = listing?.summaries?.[0]?.productType
          if (fetchedProductType) {
            productType = fetchedProductType
          }
        } catch (listingErr) {
          console.warn('Could not fetch listing for product type:', listingErr)
        }

        // Save SKU and productType to product metadata for future use
        await prisma.product.update({
          where: { id: productId },
          data: {
            metadata: {
              ...(metadata || {}),
              sku: fetchedSku,
              ...(fetchedProductType ? { productType: fetchedProductType } : {})
            }
          }
        })
        console.log(`Saved SKU "${fetchedSku}" and productType "${fetchedProductType || productType}" to product metadata`)
      } else {
        console.warn(`Could not find SKU for ASIN ${product.asin} in Amazon inventory, falling back to ASIN`)
        sku = product.asin
      }
    }

    // Create push records with PENDING status
    const pushRecords = await Promise.all(images.map(async ({ generatedImageId, amazonSlot }) => {
      const genImage = foundImages.find(i => i.id === generatedImageId)!

      // Get public URL for the image
      let imageUrl: string
      if (genImage.filePath.startsWith('http')) {
        // Already an S3 URL - use it directly
        imageUrl = genImage.filePath
      } else {
        // Local path - construct S3 URL from key
        const key = genImage.filePath.startsWith('/') ? genImage.filePath.substring(1) : genImage.filePath
        imageUrl = getPublicS3Url(key)
      }

      return prisma.amazonImagePush.create({
        data: {
          generatedImageId,
          productId,
          asin: product.asin!,
          amazonSlot,
          imageUrl,
          status: 'PENDING'
        }
      })
    }))

    // Update image statuses to PUSHING
    await prisma.generatedImage.updateMany({
      where: { id: { in: imageIds } },
      data: { amazonPushStatus: 'PUSHING' }
    })

    // Get Amazon SP client and attempt push
    const amazonSP = getAmazonSPClient()

    // Build image mappings for Amazon API
    const imageMappings: ImageSlotMapping[] = pushRecords.map(record => ({
      slot: record.amazonSlot as ImageSlotMapping['slot'],
      imageUrl: record.imageUrl
    }))

    console.log(`Pushing ${imageMappings.length} images to Amazon for ASIN: ${product.asin}`)

    // Call Amazon API
    const result = await amazonSP.updateListingImages({
      sku,
      images: imageMappings,
      productType
    })

    // Update push records with result
    const finalStatus = result.success ? 'SUCCESS' : 'FAILED'

    await Promise.all(pushRecords.map(record =>
      prisma.amazonImagePush.update({
        where: { id: record.id },
        data: {
          status: finalStatus,
          amazonResponse: result as any,
          errorMessage: result.error || null,
          completedAt: new Date()
        }
      })
    ))

    // Update image statuses and slot info
    await Promise.all(images.map(({ generatedImageId, amazonSlot }) =>
      prisma.generatedImage.update({
        where: { id: generatedImageId },
        data: {
          amazonSlot,
          amazonPushedAt: result.success ? new Date() : undefined,
          amazonPushStatus: finalStatus
        }
      })
    ))

    // Log activity
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: result.success ? "AMAZON_PUSH_SUCCESS" : "AMAZON_PUSH_FAILED",
          entityType: "Product",
          entityId: productId,
          metadata: {
            asin: product.asin,
            sku,
            imageCount: images.length,
            slots: images.map(i => i.amazonSlot),
            result: {
              success: result.success,
              status: result.status,
              error: result.error,
              issues: result.issues
            }
          }
        }
      })
    }

    // If push was successful, refresh source images from Amazon
    // Note: Amazon may take a few minutes to process, so images might not show immediately
    let sourceImagesRefreshed = false
    let refreshError: string | undefined

    if (result.success) {
      try {
        console.log(`Refreshing source images for product ${productId} from Amazon...`)

        // Fetch fresh product data from Amazon
        const amazonProduct = await amazonSP.getProductByASIN(product.asin!)

        if (amazonProduct && amazonProduct.images.length > 0) {
          // Delete existing source images
          await prisma.sourceImage.deleteMany({
            where: { productId }
          })

          // Download and save new images from Amazon
          for (let i = 0; i < amazonProduct.images.length; i++) {
            const amazonImage = amazonProduct.images[i]

            try {
              const downloadResult = await downloadAndStoreImage({
                url: amazonImage.link,
                productId,
                variant: amazonImage.variant,
                order: i
              })

              if (downloadResult.success && downloadResult.filePath) {
                await prisma.sourceImage.create({
                  data: {
                    productId,
                    amazonImageUrl: amazonImage.link,
                    localFilePath: downloadResult.filePath,
                    imageOrder: i,
                    width: downloadResult.width || amazonImage.width,
                    height: downloadResult.height || amazonImage.height,
                    fileSize: downloadResult.fileSize,
                    variant: amazonImage.variant
                  }
                })
              }
            } catch (imgErr) {
              console.error(`Failed to download source image ${i}:`, imgErr)
              // Continue with other images
            }
          }

          sourceImagesRefreshed = true
          console.log(`Source images refreshed for product ${productId}`)
        }
      } catch (refreshErr) {
        console.error("Error refreshing source images:", refreshErr)
        refreshError = refreshErr instanceof Error ? refreshErr.message : "Unknown error"
        // Don't fail the whole request - push was still successful
      }
    }

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Successfully pushed ${images.length} image(s) to Amazon listing`
        : `Failed to push images: ${result.error}`,
      asin: product.asin,
      sku,
      pushRecords: pushRecords.map(r => ({
        id: r.id,
        amazonSlot: r.amazonSlot,
        imageUrl: r.imageUrl,
        status: finalStatus
      })),
      amazonResponse: {
        status: result.status,
        issues: result.issues,
        submissionId: result.submissionId
      },
      sourceImagesRefreshed,
      refreshError
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error pushing images to Amazon:", error)
    return NextResponse.json(
      {
        error: "Failed to push images to Amazon",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
