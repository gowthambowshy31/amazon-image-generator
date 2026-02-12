import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient } from "@/lib/amazon-sp"
import { getPublicS3Url } from "@/lib/s3"

/**
 * GET /api/amazon/diagnose?productId=xxx
 * Diagnostic endpoint to check Amazon push configuration for a product.
 * Does NOT modify anything - read-only checks.
 */
export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('productId')
    const asin = request.nextUrl.searchParams.get('asin')

    if (!productId && !asin) {
      return NextResponse.json(
        { error: "Provide productId or asin query parameter" },
        { status: 400 }
      )
    }

    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      checks: {},
      issues: [],
      recommendations: []
    }

    // 1. Check environment variables
    const envChecks = {
      AMAZON_SELLER_ID: !!process.env.AMAZON_SELLER_ID,
      AMAZON_CLIENT_ID: !!process.env.AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET: !!process.env.AMAZON_CLIENT_SECRET,
      AMAZON_REFRESH_TOKEN: !!process.env.AMAZON_REFRESH_TOKEN,
      AMAZON_MARKETPLACE_ID: process.env.AMAZON_MARKETPLACE_ID || 'NOT SET (defaulting to ATVPDKIKX0DER)',
      AMAZON_REGION: process.env.AMAZON_REGION || 'NOT SET (defaulting to na)',
      AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'NOT SET',
      AWS_REGION: process.env.AWS_REGION || 'NOT SET',
    }
    diagnostics.checks.environment = envChecks

    if (!process.env.AMAZON_SELLER_ID) {
      diagnostics.issues.push('AMAZON_SELLER_ID is not set - push will fail')
    }

    // 2. Load product from database
    const product = await prisma.product.findFirst({
      where: productId ? { id: productId } : { asin: asin! },
      include: {
        images: {
          where: { status: 'APPROVED' },
          take: 5
        },
        amazonImagePushHistory: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    })

    if (!product) {
      diagnostics.issues.push('Product not found in database')
      return NextResponse.json(diagnostics)
    }

    diagnostics.checks.product = {
      id: product.id,
      title: product.title,
      asin: product.asin,
      metadata: product.metadata,
      approvedImageCount: product.images.length
    }

    // 3. Check SKU situation - THIS IS THE KEY CHECK
    const metadata = product.metadata as any
    const storedSku = metadata?.sku
    const effectiveSku = storedSku || product.asin

    diagnostics.checks.sku = {
      storedInMetadata: storedSku || null,
      effectiveSkuUsed: effectiveSku,
      usingAsinAsFallback: !storedSku,
      WARNING: !storedSku
        ? 'NO SKU stored! Code is using ASIN as SKU fallback. Amazon Listings API requires the Seller SKU, NOT the ASIN. This is likely why images are not reflecting.'
        : null
    }

    if (!storedSku) {
      diagnostics.issues.push(
        `CRITICAL: No SKU in product metadata. The push is using ASIN "${product.asin}" as SKU. ` +
        `Amazon requires Seller SKU (e.g., "MY-PRODUCT-001"), not ASIN. ` +
        `This causes Amazon to accept the submission but not apply it.`
      )
      diagnostics.recommendations.push(
        'Get the Seller SKU from Amazon Seller Central (Inventory > Manage Inventory) and store it in the product metadata'
      )
    }

    // 4. Check recent push history
    if (product.amazonImagePushHistory.length > 0) {
      diagnostics.checks.recentPushes = product.amazonImagePushHistory.map(push => ({
        id: push.id,
        slot: push.amazonSlot,
        status: push.status,
        imageUrl: push.imageUrl,
        errorMessage: push.errorMessage,
        amazonResponse: push.amazonResponse,
        createdAt: push.createdAt,
        completedAt: push.completedAt
      }))
    } else {
      diagnostics.checks.recentPushes = 'No push history found'
    }

    // 5. Check S3 image accessibility
    if (product.images.length > 0) {
      const sampleImage = product.images[0]
      let imageUrl: string
      if (sampleImage.filePath.startsWith('http')) {
        imageUrl = sampleImage.filePath
      } else {
        const key = sampleImage.filePath.startsWith('/')
          ? sampleImage.filePath.substring(1)
          : sampleImage.filePath
        imageUrl = getPublicS3Url(key)
      }

      diagnostics.checks.sampleImageUrl = {
        filePath: sampleImage.filePath,
        publicUrl: imageUrl,
        note: 'Verify this URL is accessible by Amazon. Open it in a browser to check.'
      }
    }

    // 6. Try to get listing from Amazon to find the real SKU
    if (product.asin) {
      try {
        const amazonSP = getAmazonSPClient()

        // Try to get the listing using ASIN as SKU (which is what the current code does)
        diagnostics.checks.amazonListingLookup = {}

        try {
          const listing = await amazonSP.getListingItem(product.asin)
          diagnostics.checks.amazonListingLookup.usingAsinAsSku = {
            found: true,
            response: listing,
            note: 'Listing found using ASIN as SKU - this means ASIN might work as SKU for this product'
          }
        } catch (listingErr: any) {
          diagnostics.checks.amazonListingLookup.usingAsinAsSku = {
            found: false,
            error: listingErr?.message || String(listingErr),
            note: 'Listing NOT found using ASIN as SKU - confirms SKU mismatch issue'
          }
          diagnostics.issues.push(
            `Amazon listing not found when using ASIN "${product.asin}" as SKU. This confirms the SKU/ASIN mismatch.`
          )
        }

        // Try to find the real Seller SKU from FBA inventory
        try {
          const realSku = await amazonSP.getSellerSKUByASIN(product.asin)
          diagnostics.checks.amazonListingLookup.sellerSkuFromInventory = {
            found: !!realSku,
            sellerSku: realSku,
            note: realSku
              ? `Found Seller SKU "${realSku}" for ASIN "${product.asin}". This should be used for listing updates.`
              : `Could not find Seller SKU in FBA inventory for ASIN "${product.asin}".`
          }

          if (realSku && realSku !== product.asin) {
            diagnostics.issues.push(
              `Seller SKU "${realSku}" differs from ASIN "${product.asin}". The push was using ASIN as SKU which is incorrect.`
            )
          }

          // If we found the real SKU, try getting the listing with it
          if (realSku) {
            try {
              const listingWithSku = await amazonSP.getListingItem(realSku)
              diagnostics.checks.amazonListingLookup.usingRealSku = {
                found: true,
                sku: realSku,
                response: listingWithSku,
                note: 'Listing found using real Seller SKU - this confirms the fix will work'
              }
            } catch (skuListingErr: any) {
              diagnostics.checks.amazonListingLookup.usingRealSku = {
                found: false,
                sku: realSku,
                error: skuListingErr?.message || String(skuListingErr)
              }
            }
          }
        } catch (skuErr: any) {
          diagnostics.checks.amazonListingLookup.sellerSkuFromInventory = {
            found: false,
            error: skuErr?.message || String(skuErr)
          }
        }

        // Also try fetching product info to confirm Amazon connectivity
        const catalogProduct = await amazonSP.getProductByASIN(product.asin)
        diagnostics.checks.amazonCatalogLookup = {
          found: !!catalogProduct,
          title: catalogProduct?.title,
          productType: catalogProduct?.productType,
          imageCount: catalogProduct?.images?.length || 0,
          note: 'This confirms Amazon API connectivity is working'
        }
      } catch (apiErr: any) {
        diagnostics.checks.amazonApiConnectivity = {
          working: false,
          error: apiErr?.message || String(apiErr)
        }
        diagnostics.issues.push('Failed to connect to Amazon SP-API: ' + (apiErr?.message || String(apiErr)))
      }
    }

    // 7. Summary
    diagnostics.summary = {
      totalIssues: diagnostics.issues.length,
      likelyRootCause: !storedSku
        ? 'SKU/ASIN mismatch - push uses ASIN where Seller SKU is required'
        : diagnostics.issues.length > 0
          ? diagnostics.issues[0]
          : 'No obvious issues found - check Amazon Seller Central for submission status',
      recommendedFix: !storedSku
        ? 'Add seller SKU to product metadata, or update the code to fetch SKU from Amazon Listings API'
        : null
    }

    return NextResponse.json(diagnostics, { status: 200 })
  } catch (error) {
    console.error("Diagnostic error:", error)
    return NextResponse.json(
      {
        error: "Diagnostic failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
