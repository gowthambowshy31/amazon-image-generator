import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function checkProgress() {
  const amazonSP = getAmazonSPClient()

  // Get Amazon inventory
  const amazonInventory = await amazonSP.getFBAInventoryWithQuantity(false)
  
  // Get DB products
  const dbProducts = await prisma.product.findMany({
    where: { asin: { not: null } },
    select: { asin: true }
  })

  const dbAsins = new Set(dbProducts.map(p => p.asin).filter(Boolean) as string[])
  const missing = amazonInventory.filter(item => !dbAsins.has(item.asin))

  console.log('\n📊 Import Progress:')
  console.log(`   Products in Amazon (inventory > 0): ${amazonInventory.length}`)
  console.log(`   Products in database: ${dbAsins.size}`)
  console.log(`   Missing products: ${missing.length}`)
  console.log(`   Imported: ${amazonInventory.length - missing.length}`)
  console.log(`   Progress: ${((amazonInventory.length - missing.length) / amazonInventory.length * 100).toFixed(1)}%`)

  await prisma.$disconnect()
  await pool.end()
}

checkProgress().catch(console.error)
