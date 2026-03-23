import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient, ImageSlotMapping } from "@/lib/amazon-sp"
import { getPublicS3Url } from "@/lib/s3"
import { downloadAndStoreImage } from "@/lib/image-storage"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const bulkPushSchema = z.object({
  products: z.array(z.object({
    productId: z.string(),
    images: z.array(z.object({
      generatedImageId: z.string(),
      amazonSlot: z.enum(['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06', 'PT07', 'PT08'])
    })).min(1).max(9)
  })).min(1)
})

/**
 * POST /api/amazon/bulk-push-images
 * Bulk push approved images to Amazon listings for multiple products
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { products: productPushes } = bulkPushSchema.parse(body)

    // Count total images across all products
    const totalImages = productPushes.reduce((sum, p) => sum + p.images.length, 0)

    // Create a tracking job using GenerationJob model
    const job = await prisma.generationJob.create({
      data: {
        productIds: productPushes.map(p => p.productId),
        imageTypeIds: [],
        templateIds: [],
        promptUsed: JSON.stringify({ jobType: 'amazon-push' }),
        status: "PROCESSING",
        totalImages,
        startedAt: new Date()
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_BULK_PUSH_JOB",
        entityType: "GenerationJob",
        entityId: job.id,
        metadata: {
          productCount: productPushes.length,
          totalImages,
          jobType: 'amazon-push'
        }
      }
    })

    // Process in background (don't await)
    processBulkPush(job.id, productPushes, user.id).catch(err => {
      console.error("Bulk push job failed:", err)
    })

    return NextResponse.json({
      jobId: job.id,
      totalProducts: productPushes.length,
      totalImages
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating bulk push job:", error)
    return NextResponse.json(
      { error: "Failed to create bulk push job" },
      { status: 500 }
    )
  }
}

// Background processing function
async function processBulkPush(
  jobId: string,
  productPushes: z.infer<typeof bulkPushSchema>['products'],
  adminUserId?: string
) {
  let completedCount = 0
  let failedCount = 0
  const errors: string[] = []
  const amazonSP = getAmazonSPClient()

  for (let i = 0; i < productPushes.length; i++) {
    const { productId, images } = productPushes[i]

    try {
      console.log(`[Bulk Push ${jobId}] Processing product ${i + 1}/${productPushes.length}: ${productId}`)

      // Get product with ASIN and metadata
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          images: {
            where: {
              id: { in: images.map(img => img.generatedImageId) }
            }
          }
        }
      })

      if (!product || !product.asin) {
        failedCount += images.length
        errors.push(`${product?.asin || productId}: No ASIN found`)
        await updateJobProgress(jobId, completedCount, failedCount, errors)
        continue
      }

      // Validate all images exist and are APPROVED
      const foundImages = product.images
      const missingImages = images.filter(img =>
        !foundImages.find(f => f.id === img.generatedImageId)
      )
      if (missingImages.length > 0) {
        failedCount += images.length
        errors.push(`${product.asin}: ${missingImages.length} image(s) not found`)
        await updateJobProgress(jobId, completedCount, failedCount, errors)
        continue
      }

      const nonApproved = foundImages.filter(img => img.status !== 'APPROVED')
      if (nonApproved.length > 0) {
        failedCount += images.length
        errors.push(`${product.asin}: ${nonApproved.length} image(s) not APPROVED`)
        await updateJobProgress(jobId, completedCount, failedCount, errors)
        continue
      }

      // Resolve SKU
      const metadata = product.metadata as any
      let productType = metadata?.productType || 'PRODUCT'
      let sku = metadata?.sku

      if (!sku) {
        const fetchedSku = await amazonSP.getSellerSKUByASIN(product.asin)
        if (fetchedSku) {
          sku = fetchedSku
          // Fetch product type from listing
          try {
            const listing = await amazonSP.getListingItem(fetchedSku)
            const fetchedProductType = listing?.summaries?.[0]?.productType
            if (fetchedProductType) productType = fetchedProductType
          } catch {}
          // Save SKU to product metadata
          await prisma.product.update({
            where: { id: productId },
            data: {
              metadata: {
                ...(metadata || {}),
                sku: fetchedSku,
                productType
              }
            }
          })
        } else {
          sku = product.asin
        }
      }

      // Create push records
      const pushRecords = await Promise.all(images.map(async ({ generatedImageId, amazonSlot }) => {
        const genImage = foundImages.find(img => img.id === generatedImageId)!
        let imageUrl: string
        if (genImage.filePath.startsWith('http')) {
          imageUrl = genImage.filePath
        } else {
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
        where: { id: { in: images.map(img => img.generatedImageId) } },
        data: { amazonPushStatus: 'PUSHING' }
      })

      // Build image mappings and call Amazon API
      const imageMappings: ImageSlotMapping[] = pushRecords.map(record => ({
        slot: record.amazonSlot as ImageSlotMapping['slot'],
        imageUrl: record.imageUrl
      }))

      const result = await amazonSP.updateListingImages({ sku, images: imageMappings, productType })
      const finalStatus = result.success ? 'SUCCESS' : 'FAILED'

      // Update push records
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

      // Update image statuses
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

      if (result.success) {
        completedCount += images.length
        console.log(`[Bulk Push ${jobId}] Success: ${product.asin} (${images.length} images)`)

        // Refresh source images from Amazon
        try {
          const amazonProduct = await amazonSP.getProductByASIN(product.asin)
          if (amazonProduct && amazonProduct.images.length > 0) {
            await prisma.sourceImage.deleteMany({ where: { productId } })
            for (let j = 0; j < amazonProduct.images.length; j++) {
              const amazonImage = amazonProduct.images[j]
              try {
                const downloadResult = await downloadAndStoreImage({
                  url: amazonImage.link,
                  productId,
                  variant: amazonImage.variant,
                  order: j
                })
                if (downloadResult.success && downloadResult.filePath) {
                  await prisma.sourceImage.create({
                    data: {
                      productId,
                      amazonImageUrl: amazonImage.link,
                      localFilePath: downloadResult.filePath,
                      imageOrder: j,
                      width: downloadResult.width || amazonImage.width,
                      height: downloadResult.height || amazonImage.height,
                      fileSize: downloadResult.fileSize,
                      variant: amazonImage.variant
                    }
                  })
                }
              } catch {}
            }
          }
        } catch (refreshErr) {
          console.warn(`[Bulk Push ${jobId}] Source image refresh failed for ${product.asin}:`, refreshErr)
        }
      } else {
        failedCount += images.length
        errors.push(`${product.asin}: ${result.error || 'Amazon API rejected the update'}`)
      }

      // Log activity per product
      if (adminUserId) {
        await prisma.activityLog.create({
          data: {
            userId: adminUserId,
            action: result.success ? "AMAZON_PUSH_SUCCESS" : "AMAZON_PUSH_FAILED",
            entityType: "Product",
            entityId: productId,
            metadata: {
              asin: product.asin,
              sku,
              imageCount: images.length,
              slots: images.map(img => img.amazonSlot),
              bulkJobId: jobId,
              result: { success: result.success, status: result.status, error: result.error }
            }
          }
        })
      }

      await updateJobProgress(jobId, completedCount, failedCount, errors)

      // Rate limit delay between products (500ms)
      if (i < productPushes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      failedCount += images.length
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      errors.push(`${productId}: ${errorMsg}`)
      await updateJobProgress(jobId, completedCount, failedCount, errors)
      console.error(`[Bulk Push ${jobId}] Failed: ${productId}`, error)
    }
  }

  // Mark job as complete
  const totalImages = productPushes.reduce((sum, p) => sum + p.images.length, 0)
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: failedCount === totalImages ? "FAILED" : "COMPLETED",
      completedImages: completedCount,
      failedImages: failedCount,
      errorLog: errors.length > 0 ? errors.join("\n") : null,
      completedAt: new Date()
    }
  })

  console.log(`[Bulk Push ${jobId}] Job finished. ${completedCount} completed, ${failedCount} failed.`)
}

async function updateJobProgress(
  jobId: string,
  completed: number,
  failed: number,
  errors: string[]
) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      completedImages: completed,
      failedImages: failed,
      errorLog: errors.length > 0 ? errors.join("\n") : null
    }
  })
}
