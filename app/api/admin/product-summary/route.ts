import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAmazonSPClient } from "@/lib/amazon-sp"
import { requireAuth } from "@/lib/auth-helpers"

/**
 * GET /api/admin/product-summary
 * Returns a summary of products, inventory, and images
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error

  try {
    const amazonSP = getAmazonSPClient()

    // Get all products from database
    const allProducts = await prisma.product.findMany({
      include: {
        sourceImages: {
          select: {
            id: true,
            variant: true
          }
        }
      }
    })

    // Filter products with inventory > 0
    const productsWithInventory = allProducts.filter(p => {
      const metadata = p.metadata as any
      const quantity = metadata?.inventory?.quantity ?? metadata?.quantity ?? 0
      return quantity > 0
    })

    // Get inventory from Amazon API
    let amazonInventory: Array<{ asin: string; quantity: number; productName?: string }> = []
    try {
      amazonInventory = await amazonSP.getFBAInventoryWithQuantity(false) // Only items with quantity > 0
    } catch (error) {
      console.error("Error fetching Amazon inventory:", error)
      // Continue without Amazon data
    }

    // Create maps for comparison
    const amazonInventoryMap = new Map<string, number>()
    amazonInventory.forEach(item => {
      amazonInventoryMap.set(item.asin, item.quantity)
    })

    const dbAsins = new Set(productsWithInventory.map(p => p.asin).filter(Boolean))
    const amazonAsins = new Set(amazonInventory.map(i => i.asin))

    // Find products in Amazon but not in DB
    const inAmazonNotInDb = amazonInventory.filter(i => !dbAsins.has(i.asin))
    const inDbNotInAmazon = productsWithInventory.filter(p => p.asin && !amazonAsins.has(p.asin))

    // Image statistics
    const productsWithOneImage = productsWithInventory.filter(p => p.sourceImages.length === 1)
    const productsWithImages = productsWithInventory.filter(p => p.sourceImages.length > 0)
    const productsWithoutImages = productsWithInventory.filter(p => p.sourceImages.length === 0)

    // Image count distribution
    const imageCountDistribution: Record<number, number> = {}
    productsWithInventory.forEach(p => {
      const count = p.sourceImages.length
      imageCountDistribution[count] = (imageCountDistribution[count] || 0) + 1
    })

    // Total images
    const totalSourceImages = productsWithInventory.reduce((sum, p) => sum + p.sourceImages.length, 0)

    return NextResponse.json({
      summary: {
        totalProductsInDb: allProducts.length,
        productsWithInventoryInDb: productsWithInventory.length,
        productsWithInventoryInAmazon: amazonInventory.length,
        difference: Math.abs(amazonInventory.length - productsWithInventory.length),
        productsInAmazonNotInDb: inAmazonNotInDb.length,
        productsInDbNotInAmazon: inDbNotInAmazon.length
      },
      images: {
        totalSourceImages,
        productsWithImages: productsWithImages.length,
        productsWithoutImages: productsWithoutImages.length,
        productsWithOneImage: productsWithOneImage.length,
        imageImportRate: productsWithInventory.length > 0
          ? (productsWithImages.length / productsWithInventory.length) * 100
          : 0,
        imageCountDistribution
      },
      productsWithOneImage: productsWithOneImage.slice(0, 20).map(p => ({
        id: p.id,
        asin: p.asin,
        title: p.title,
        imageCount: p.sourceImages.length,
        inventory: (p.metadata as any)?.inventory?.quantity ?? (p.metadata as any)?.quantity ?? 0
      })),
      missingProducts: inAmazonNotInDb.slice(0, 50).map(item => ({
        asin: item.asin,
        quantity: item.quantity,
        productName: item.productName
      }))
    })
  } catch (error) {
    console.error("Error generating product summary:", error)
    return NextResponse.json(
      {
        error: "Failed to generate product summary",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
