import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface ProductAnalysis {
  asin: string
  productId: string
  title: string
  dbImageCount: number
  amazonImageCount: number
  inventory: number
  hasMoreImages: boolean
  missingImages: number
}

async function verifyProductsAndImages() {
  console.log('\n🔍 Starting Product and Image Verification\n')
  console.log('='.repeat(80))

  const amazonSP = getAmazonSPClient()

  try {
    // Step 1: Get all products with inventory > 0 from database
    console.log('\n📊 Step 1: Analyzing products in database...')
    const allProducts = await prisma.product.findMany({
      include: {
        sourceImages: {
          select: {
            id: true,
            variant: true,
            amazonImageUrl: true
          },
          orderBy: {
            imageOrder: 'asc'
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

    console.log(`✅ Total products in database: ${allProducts.length}`)
    console.log(`✅ Products with inventory > 0: ${productsWithInventory.length}`)

    // Step 2: Get products with only one image
    console.log('\n📸 Step 2: Finding products with only one image...')
    const productsWithOneImage = productsWithInventory.filter(p => p.sourceImages.length === 1)
    console.log(`⚠️  Products with only 1 image: ${productsWithOneImage.length}`)

    if (productsWithOneImage.length > 0) {
      console.log('\n📋 Sample products with only one image (first 10):')
      productsWithOneImage.slice(0, 10).forEach((p, idx) => {
        const metadata = p.metadata as any
        const quantity = metadata?.inventory?.quantity ?? metadata?.quantity ?? 0
        console.log(`   ${idx + 1}. ${p.asin} - ${p.title.substring(0, 60)}... (Qty: ${quantity})`)
      })
    }

    // Step 3: Fetch inventory from Amazon API
    console.log('\n📦 Step 3: Fetching inventory from Amazon API...')
    const amazonInventory = await amazonSP.getFBAInventoryWithQuantity(false) // Only items with quantity > 0
    console.log(`✅ Products with inventory > 0 from Amazon API: ${amazonInventory.length}`)

    // Create a map for quick lookup
    const amazonInventoryMap = new Map<string, number>()
    amazonInventory.forEach(item => {
      amazonInventoryMap.set(item.asin, item.quantity)
    })

    // Step 4: Test products with one image against Amazon API
    console.log('\n🔬 Step 4: Testing products with one image against Amazon API...')
    console.log(`   Testing ${Math.min(productsWithOneImage.length, 20)} products...\n`)

    const analysisResults: ProductAnalysis[] = []
    const testLimit = Math.min(productsWithOneImage.length, 20)

    for (let i = 0; i < testLimit; i++) {
      const product = productsWithOneImage[i]
      if (!product.asin) continue

      try {
        console.log(`   [${i + 1}/${testLimit}] Testing ${product.asin}...`)
        const amazonProduct = await amazonSP.getProductByASIN(product.asin)

        if (amazonProduct) {
          const metadata = product.metadata as any
          const quantity = metadata?.inventory?.quantity ?? metadata?.quantity ?? 0

          const analysis: ProductAnalysis = {
            asin: product.asin,
            productId: product.id,
            title: product.title,
            dbImageCount: product.sourceImages.length,
            amazonImageCount: amazonProduct.images.length,
            inventory: quantity,
            hasMoreImages: amazonProduct.images.length > product.sourceImages.length,
            missingImages: Math.max(0, amazonProduct.images.length - product.sourceImages.length)
          }

          analysisResults.push(analysis)

          if (analysis.hasMoreImages) {
            console.log(`      ✅ Found ${amazonProduct.images.length} images on Amazon (DB has ${product.sourceImages.length})`)
            console.log(`         Missing ${analysis.missingImages} images!`)
          } else {
            console.log(`      ℹ️  Amazon also has ${amazonProduct.images.length} image(s)`)
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500))
        } else {
          console.log(`      ⚠️  Could not fetch product from Amazon API`)
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Step 5: Summary of analysis
    console.log('\n' + '='.repeat(80))
    console.log('📊 ANALYSIS SUMMARY')
    console.log('='.repeat(80))

    const productsWithMoreImages = analysisResults.filter(r => r.hasMoreImages)
    console.log(`\n🖼️  Image Analysis:`)
    console.log(`   Products tested: ${analysisResults.length}`)
    console.log(`   Products with more images on Amazon: ${productsWithMoreImages.length}`)
    console.log(`   Total missing images: ${productsWithMoreImages.reduce((sum, r) => sum + r.missingImages, 0)}`)

    if (productsWithMoreImages.length > 0) {
      console.log(`\n⚠️  Products that need image re-import:`)
      productsWithMoreImages.forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.asin} - Missing ${r.missingImages} images (DB: ${r.dbImageCount}, Amazon: ${r.amazonImageCount})`)
      })
    }

    // Step 6: Inventory comparison
    console.log(`\n📦 Inventory Comparison:`)
    console.log(`   Products with inventory > 0 in Amazon API: ${amazonInventory.length}`)
    console.log(`   Products with inventory > 0 in database: ${productsWithInventory.length}`)
    console.log(`   Difference: ${Math.abs(amazonInventory.length - productsWithInventory.length)}`)

    // Find products in Amazon but not in DB
    const amazonAsins = new Set(amazonInventory.map(i => i.asin))
    const dbAsins = new Set(productsWithInventory.map(p => p.asin).filter(Boolean))
    const inAmazonNotInDb = amazonInventory.filter(i => !dbAsins.has(i.asin))
    const inDbNotInAmazon = productsWithInventory.filter(p => p.asin && !amazonAsins.has(p.asin))

    console.log(`\n   Products in Amazon but not in DB: ${inAmazonNotInDb.length}`)
    console.log(`   Products in DB but not in Amazon: ${inDbNotInAmazon.length}`)

    if (inAmazonNotInDb.length > 0 && inAmazonNotInDb.length <= 20) {
      console.log(`\n   Sample products in Amazon but not in DB (first 10):`)
      inAmazonNotInDb.slice(0, 10).forEach((item, idx) => {
        console.log(`      ${idx + 1}. ${item.asin} - Qty: ${item.quantity}`)
      })
    }

    // Step 7: Image import verification
    console.log(`\n🖼️  Image Import Verification:`)
    const productsWithImages = productsWithInventory.filter(p => p.sourceImages.length > 0)
    const productsWithoutImages = productsWithInventory.filter(p => p.sourceImages.length === 0)

    console.log(`   Products with images imported: ${productsWithImages.length}`)
    console.log(`   Products without images: ${productsWithoutImages.length}`)
    console.log(`   Image import rate: ${((productsWithImages.length / productsWithInventory.length) * 100).toFixed(1)}%`)

    if (productsWithoutImages.length > 0 && productsWithoutImages.length <= 20) {
      console.log(`\n   Sample products without images (first 10):`)
      productsWithoutImages.slice(0, 10).forEach((p, idx) => {
        const metadata = p.metadata as any
        const quantity = metadata?.inventory?.quantity ?? metadata?.quantity ?? 0
        console.log(`      ${idx + 1}. ${p.asin} - Qty: ${quantity} - ${p.title.substring(0, 50)}...`)
      })
    }

    // Step 8: Detailed statistics
    console.log(`\n📈 Detailed Statistics:`)
    const imageCountDistribution: Record<number, number> = {}
    productsWithInventory.forEach(p => {
      const count = p.sourceImages.length
      imageCountDistribution[count] = (imageCountDistribution[count] || 0) + 1
    })

    console.log(`   Image count distribution:`)
    Object.entries(imageCountDistribution)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([count, num]) => {
        console.log(`      ${count} image(s): ${num} products`)
      })

    console.log('\n' + '='.repeat(80))
    console.log('✅ Verification Complete!')
    console.log('='.repeat(80) + '\n')

    // Return summary for potential API usage
    return {
      totalProductsInDb: allProducts.length,
      productsWithInventoryInDb: productsWithInventory.length,
      productsWithInventoryInAmazon: amazonInventory.length,
      productsWithOneImage: productsWithOneImage.length,
      productsWithMoreImagesOnAmazon: productsWithMoreImages.length,
      totalMissingImages: productsWithMoreImages.reduce((sum, r) => sum + r.missingImages, 0),
      productsInAmazonNotInDb: inAmazonNotInDb.length,
      productsInDbNotInAmazon: inDbNotInAmazon.length,
      productsWithImagesImported: productsWithImages.length,
      productsWithoutImages: productsWithoutImages.length,
      imageImportRate: (productsWithImages.length / productsWithInventory.length) * 100
    }

  } catch (error) {
    console.error('\n❌ Error during verification:', error)
    throw error
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

// Run the verification
verifyProductsAndImages()
  .then((summary) => {
    console.log('\n📋 Final Summary:')
    console.log(JSON.stringify(summary, null, 2))
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
