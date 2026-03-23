import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient, ImageSlotMapping } from "@/lib/amazon-sp"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const externalPushSchema = z.object({
  images: z.array(z.object({
    asin: z.string().min(1),
    amazonSlot: z.enum(['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06', 'PT07', 'PT08']),
    imageUrl: z.string().url(),
  })).min(1)
})

/**
 * POST /api/amazon/push-external-images
 * Push externally-uploaded images (files or URLs) to Amazon listings.
 * Groups images by ASIN and pushes each product sequentially.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { images } = externalPushSchema.parse(body)

    // Group images by ASIN
    const byAsin = new Map<string, typeof images>()
    for (const img of images) {
      const existing = byAsin.get(img.asin) || []
      existing.push(img)
      byAsin.set(img.asin, existing)
    }

    const totalImages = images.length
    const totalProducts = byAsin.size

    // Create a tracking job
    const job = await prisma.generationJob.create({
      data: {
        productIds: Array.from(byAsin.keys()),
        imageTypeIds: [],
        templateIds: [],
        promptUsed: JSON.stringify({ jobType: 'amazon-external-push' }),
        status: "PROCESSING",
        totalImages,
        startedAt: new Date()
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_EXTERNAL_PUSH_JOB",
        entityType: "GenerationJob",
        entityId: job.id,
        metadata: {
          productCount: totalProducts,
          totalImages,
          jobType: 'amazon-external-push'
        }
      }
    })

    // Process in background
    processExternalPush(job.id, byAsin, user.id).catch(err => {
      console.error("External push job failed:", err)
    })

    return NextResponse.json({
      jobId: job.id,
      totalProducts,
      totalImages
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating external push job:", error)
    return NextResponse.json(
      { error: "Failed to create external push job" },
      { status: 500 }
    )
  }
}

async function processExternalPush(
  jobId: string,
  byAsin: Map<string, Array<{ asin: string; amazonSlot: string; imageUrl: string }>>,
  adminUserId?: string
) {
  let completedCount = 0
  let failedCount = 0
  const errors: string[] = []
  const amazonSP = getAmazonSPClient()
  const asins = Array.from(byAsin.keys())

  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i]
    const asinImages = byAsin.get(asin)!

    try {
      console.log(`[External Push ${jobId}] Processing ASIN ${asin} (${i + 1}/${asins.length})`)

      // Look up product in our database (may not exist)
      const product = await prisma.product.findFirst({
        where: { asin }
      })

      // Resolve SKU
      let sku: string
      let productType = 'PRODUCT'

      if (product) {
        const metadata = product.metadata as any
        sku = metadata?.sku || ''
        productType = metadata?.productType || 'PRODUCT'
      } else {
        sku = ''
      }

      if (!sku) {
        const fetchedSku = await amazonSP.getSellerSKUByASIN(asin)
        if (fetchedSku) {
          sku = fetchedSku
          try {
            const listing = await amazonSP.getListingItem(fetchedSku)
            const fetchedProductType = listing?.summaries?.[0]?.productType
            if (fetchedProductType) productType = fetchedProductType
          } catch {}

          // Save SKU to product metadata if product exists
          if (product) {
            const metadata = product.metadata as any
            await prisma.product.update({
              where: { id: product.id },
              data: {
                metadata: {
                  ...(metadata || {}),
                  sku: fetchedSku,
                  productType
                }
              }
            })
          }
        } else {
          sku = asin
        }
      }

      // Create push records if we have a product in our DB
      if (product) {
        await Promise.all(asinImages.map(({ amazonSlot, imageUrl }) =>
          prisma.amazonImagePush.create({
            data: {
              generatedImageId: product.id, // Use product ID as reference since there's no generated image
              productId: product.id,
              asin,
              amazonSlot,
              imageUrl,
              status: 'PENDING'
            }
          }).catch(() => {
            // If the generatedImageId FK fails, skip push record creation
            // This happens when the product exists but has no generated images
          })
        ))
      }

      // Build image mappings and call Amazon API
      const imageMappings: ImageSlotMapping[] = asinImages.map(({ amazonSlot, imageUrl }) => ({
        slot: amazonSlot as ImageSlotMapping['slot'],
        imageUrl
      }))

      const result = await amazonSP.updateListingImages({ sku, images: imageMappings, productType })

      if (result.success) {
        completedCount += asinImages.length
        console.log(`[External Push ${jobId}] Success: ${asin} (${asinImages.length} images)`)
      } else {
        failedCount += asinImages.length
        errors.push(`${asin}: ${result.error || 'Amazon API rejected the update'}`)
      }

      // Log activity
      if (adminUserId) {
        await prisma.activityLog.create({
          data: {
            userId: adminUserId,
            action: result.success ? "AMAZON_EXTERNAL_PUSH_SUCCESS" : "AMAZON_EXTERNAL_PUSH_FAILED",
            entityType: "Product",
            entityId: product?.id || asin,
            metadata: {
              asin,
              sku,
              imageCount: asinImages.length,
              slots: asinImages.map(img => img.amazonSlot),
              bulkJobId: jobId,
              external: true,
              result: { success: result.success, status: result.status, error: result.error }
            }
          }
        })
      }

      await updateJobProgress(jobId, completedCount, failedCount, errors)

      // Rate limit delay between products
      if (i < asins.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      failedCount += asinImages.length
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      errors.push(`${asin}: ${errorMsg}`)
      await updateJobProgress(jobId, completedCount, failedCount, errors)
      console.error(`[External Push ${jobId}] Failed: ${asin}`, error)
    }
  }

  // Mark job as complete
  const totalImages = Array.from(byAsin.values()).reduce((sum, imgs) => sum + imgs.length, 0)
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

  console.log(`[External Push ${jobId}] Job finished. ${completedCount} completed, ${failedCount} failed.`)
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
