import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function verifyInStockProducts() {
  try {
    console.log('\n📊 In-Stock Products Summary\n')

    // Get all products and filter by inventory in memory
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
    const productsWithInventory = allProducts
      .filter(p => {
        const metadata = p.metadata as any
        return metadata?.inventory?.quantity > 0
      })
      .sort((a, b) => {
        const qtyA = (a.metadata as any)?.inventory?.quantity || 0
        const qtyB = (b.metadata as any)?.inventory?.quantity || 0
        return qtyB - qtyA
      })

    console.log(`✅ Total Products with Inventory > 0: ${productsWithInventory.length}`)
    console.log(`🖼️  Products with Images: ${productsWithInventory.filter(p => p.sourceImages.length > 0).length}\n`)

    // Show top products by quantity
    console.log('📦 Top 20 Products by Inventory Quantity:\n')
    productsWithInventory.slice(0, 20).forEach((product, idx) => {
      const quantity = (product.metadata as any)?.inventory?.quantity || 0
      const imageCount = product.sourceImages.length
      console.log(`${idx + 1}. ${product.asin} - Qty: ${quantity} - Images: ${imageCount}`)
      console.log(`   ${product.title.substring(0, 70)}...`)
      console.log('')
    })

    // Summary by quantity ranges
    const ranges = [
      { min: 1, max: 5, count: 0 },
      { min: 6, max: 10, count: 0 },
      { min: 11, max: 20, count: 0 },
      { min: 21, max: 50, count: 0 },
      { min: 51, max: Infinity, count: 0 }
    ]

    productsWithInventory.forEach(product => {
      const qty = (product.metadata as any)?.inventory?.quantity || 0
      for (const range of ranges) {
        if (qty >= range.min && qty <= range.max) {
          range.count++
          break
        }
      }
    })

    console.log('📊 Inventory Distribution:')
    ranges.forEach(range => {
      const label = range.max === Infinity ? `${range.min}+` : `${range.min}-${range.max}`
      console.log(`   ${label} units: ${range.count} products`)
    })

    console.log('\n✅ Verification complete!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

verifyInStockProducts()
