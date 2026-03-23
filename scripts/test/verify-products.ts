import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function verifyProducts() {
  try {
    // Count total products
    const totalProducts = await prisma.product.count()
    console.log(`\n📊 Total Products: ${totalProducts}`)

    // Count products with source images
    const productsWithImages = await prisma.product.count({
      where: {
        sourceImages: {
          some: {}
        }
      }
    })
    console.log(`🖼️  Products with Images: ${productsWithImages}`)

    // Count total source images
    const totalImages = await prisma.sourceImage.count()
    console.log(`📷 Total Source Images: ${totalImages}`)

    // Get sample products
    console.log('\n📦 Sample Products (first 10):')
    const sampleProducts = await prisma.product.findMany({
      take: 10,
      include: {
        sourceImages: {
          select: {
            id: true,
            variant: true,
            imageOrder: true,
            width: true,
            height: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    sampleProducts.forEach((product, idx) => {
      console.log(`\n${idx + 1}. ${product.title}`)
      console.log(`   ASIN: ${product.asin}`)
      console.log(`   Category: ${product.category || 'N/A'}`)
      console.log(`   Images: ${product.sourceImages.length}`)
      if (product.sourceImages.length > 0) {
        product.sourceImages.slice(0, 3).forEach(img => {
          console.log(`     - ${img.variant} (${img.width}x${img.height})`)
        })
        if (product.sourceImages.length > 3) {
          console.log(`     ... and ${product.sourceImages.length - 3} more`)
        }
      }
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

verifyProducts()
