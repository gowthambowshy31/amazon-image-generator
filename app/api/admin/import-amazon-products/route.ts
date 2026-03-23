import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AmazonSPService } from "@/lib/amazon-sp"
import { downloadAndStoreImage } from "@/lib/image-storage"
import { requireAuth } from "@/lib/auth-helpers"

// POST /api/admin/import-amazon-products - Import products from Amazon FBA inventory
export async function POST() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  try {
    // Check environment variables first
    const envCheck = {
      AMAZON_REGION: !!process.env.AMAZON_REGION,
      AMAZON_MARKETPLACE_ID: !!process.env.AMAZON_MARKETPLACE_ID,
      AMAZON_CLIENT_ID: !!process.env.AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET: !!process.env.AMAZON_CLIENT_SECRET,
      AMAZON_REFRESH_TOKEN: !!process.env.AMAZON_REFRESH_TOKEN,
      DATABASE_URL: !!process.env.DATABASE_URL
    }

    const missingEnvVars = Object.entries(envCheck)
      .filter(([_, value]) => !value)
      .map(([key]) => key)

    if (missingEnvVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing environment variables: ${missingEnvVars.join(", ")}`,
        envCheck
      }, { status: 500 })
    }

    const amazonClient = new AmazonSPService()

    // Fetch FBA inventory
    console.log("Fetching FBA inventory from Amazon...")
    let inventory
    try {
      inventory = await amazonClient.getFBAInventoryWithQuantity()
    } catch (inventoryError) {
      return NextResponse.json({
        success: false,
        error: "Failed to fetch FBA inventory from Amazon",
        details: String(inventoryError),
        envCheck
      }, { status: 500 })
    }

    if (!inventory || inventory.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No FBA inventory found"
      })
    }

    console.log(`Found ${inventory.length} FBA products`)

    // Use the authenticated user for createdBy

    let processed = 0
    let skipped = 0
    let errors = 0

    // Process ALL products - skipped ones don't count toward limit
    // Only limit actual API calls to Amazon (new products to fetch)
    // With S3 uploads, each product takes longer, so reduce batch size
    const maxNewProducts = 5 // Max new products to import per request (reduced for S3 uploads)

    for (let i = 0; i < inventory.length; i++) {
      // Stop if we've processed enough NEW products
      if (processed >= maxNewProducts) {
        console.log(`Reached limit of ${maxNewProducts} new products`)
        break
      }

      const item = inventory[i]
      const asin = item.asin

      try {
        // Check if product already exists (fast DB query, no limit needed)
        const existingProduct = await prisma.product.findFirst({
          where: { asin },
          include: { sourceImages: true }
        })

        if (existingProduct && existingProduct.sourceImages.length > 0) {
          // Skip silently - don't log every skip to reduce noise
          skipped++
          continue
        }

        // Fetch product details from Amazon
        console.log(`Fetching details for ${asin}... (${processed + 1}/${maxNewProducts})`)
        const productDetails = await amazonClient.getProductByASIN(asin)

        if (!productDetails) {
          console.log(`Could not fetch details for ${asin}`)
          errors++
          continue
        }

        // Create or update product
        const product = existingProduct
          ? existingProduct
          : await prisma.product.create({
              data: {
                asin,
                title: productDetails.title || `Product ${asin}`,
                category: productDetails.productType || "Uncategorized",
                status: "NOT_STARTED",
                createdById: user.id,
                organizationId: user.organizationId,
                metadata: {
                  brand: productDetails.brand,
                  manufacturer: productDetails.manufacturer,
                  quantity: item.quantity
                }
              }
            })

        // Download and save images to S3
        if (productDetails.images && productDetails.images.length > 0) {
          // Limit images per product to avoid timeouts (take highest resolution per variant)
          const imagesByVariant = new Map<string, typeof productDetails.images[0]>()
          for (const img of productDetails.images) {
            const variant = img.variant || "MAIN"
            const existing = imagesByVariant.get(variant)
            if (!existing || (img.width * img.height) > (existing.width * existing.height)) {
              imagesByVariant.set(variant, img)
            }
          }
          const uniqueImages = Array.from(imagesByVariant.values())

          for (let imgIndex = 0; imgIndex < uniqueImages.length; imgIndex++) {
            const image = uniqueImages[imgIndex]
            const variant = image.variant || (imgIndex === 0 ? "MAIN" : `PT0${imgIndex}`)

            try {
              // Download image and upload to S3
              const storageResult = await downloadAndStoreImage({
                url: image.link,
                productId: product.id,
                variant: variant,
                order: imgIndex
              })

              // Create source image record with S3 path
              await prisma.sourceImage.create({
                data: {
                  productId: product.id,
                  amazonImageUrl: image.link,
                  localFilePath: storageResult.success ? storageResult.filePath : null,
                  variant: variant,
                  imageOrder: imgIndex,
                  width: storageResult.width || image.width,
                  height: storageResult.height || image.height,
                  fileSize: storageResult.fileSize
                }
              })

              if (storageResult.success) {
                console.log(`  Uploaded image ${variant} to S3`)
              } else {
                console.log(`  Failed to upload ${variant}: ${storageResult.error}`)
              }
            } catch (imgError) {
              console.error(`Error saving image for ${asin}:`, imgError)
            }
          }
        }

        processed++
        console.log(`Processed ${asin} (${processed}/${maxNewProducts})`)

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch (error) {
        console.error(`Error processing ${asin}:`, error)
        errors++
      }
    }

    const hasMore = processed >= maxNewProducts && (skipped + processed + errors) < inventory.length

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors,
      total: inventory.length,
      hasMore,
      message: `Imported ${processed} products. Skipped ${skipped} existing.${hasMore ? " Run again to import more." : ""}`
    })
  } catch (error) {
    console.error("Error importing Amazon products:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to import Amazon products",
        details: String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

// GET /api/admin/import-amazon-products - Check import status
export async function GET() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error

  try {
    const productCount = await prisma.product.count()
    const sourceImageCount = await prisma.sourceImage.count()

    return NextResponse.json({
      products: productCount,
      sourceImages: sourceImageCount
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get import status" },
      { status: 500 }
    )
  }
}
