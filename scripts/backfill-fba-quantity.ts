/**
 * Backfill Product.metadata.quantity from current FBA inventory for one org.
 *
 * Usage:
 *   npx tsx scripts/backfill-fba-quantity.ts <orgSlug>
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import * as dotenv from "dotenv"
import { getAmazonSPClientForOrg } from "../lib/amazon-sp"

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("Usage: npx tsx scripts/backfill-fba-quantity.ts <orgSlug>")
    process.exit(1)
  }

  const org = await prisma.organization.findUnique({ where: { slug } })
  if (!org) {
    console.error(`Organization "${slug}" not found.`)
    process.exit(1)
  }

  console.log(`Fetching FBA inventory for ${org.name}...`)
  const sp = await getAmazonSPClientForOrg(org.id)
  const items = await sp.getFBAInventoryWithQuantity(true)
  console.log(`  Got ${items.length} inventory rows.`)

  const qtyByAsin = new Map<string, number>()
  for (const item of items) {
    qtyByAsin.set(item.asin, (qtyByAsin.get(item.asin) || 0) + item.quantity)
  }

  const products = await prisma.product.findMany({
    where: { organizationId: org.id, asin: { not: null } },
    select: { id: true, asin: true, metadata: true },
  })
  console.log(`  ${products.length} products in DB for this org.`)

  let updated = 0
  let missing = 0
  for (const p of products) {
    if (!p.asin) continue
    const quantity = qtyByAsin.get(p.asin)
    if (quantity === undefined) {
      missing++
      continue
    }
    const meta = (p.metadata as Record<string, unknown> | null) || {}
    await prisma.product.update({
      where: { id: p.id },
      data: { metadata: { ...meta, quantity } },
    })
    updated++
  }

  console.log(`\n✅ Done. updated=${updated}  missing_from_fba=${missing}`)
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
