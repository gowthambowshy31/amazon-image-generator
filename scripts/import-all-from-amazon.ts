/**
 * Import every product from an Amazon seller account into our DB, scoped to an org.
 *
 * Usage:
 *   npx tsx scripts/import-all-from-amazon.ts <orgSlug>
 *   npx tsx scripts/import-all-from-amazon.ts privosa
 *   npx tsx scripts/import-all-from-amazon.ts purplekiwi
 *
 * Flow:
 *   1. Look up org by slug → find active AmazonConnection
 *   2. Build per-org SP client via getAmazonSPClientForOrg
 *   3. List all FBA inventory ASINs (paginated)
 *   4. For each ASIN: upsert Product and download/store SourceImages
 *
 * Idempotent: existing products with source images are skipped.
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import * as dotenv from "dotenv"
import { getAmazonSPClientForOrg } from "../lib/amazon-sp"
import { downloadAndStoreImage } from "../lib/image-storage"

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("Usage: npx tsx scripts/import-all-from-amazon.ts <orgSlug>")
    process.exit(1)
  }

  const org = await prisma.organization.findUnique({ where: { slug } })
  if (!org) {
    console.error(`Organization with slug "${slug}" not found. Run seed-two-orgs.ts first.`)
    process.exit(1)
  }

  const admin = await prisma.user.findFirst({
    where: { organizationId: org.id, role: "ADMIN" },
  })
  if (!admin) {
    console.error(`No admin user for org "${slug}". Run seed-two-orgs.ts first.`)
    process.exit(1)
  }

  const connection = await prisma.amazonConnection.findFirst({
    where: { organizationId: org.id, isActive: true },
  })
  if (!connection) {
    console.error(`No active AmazonConnection for org "${slug}". Run seed-two-orgs.ts first.`)
    process.exit(1)
  }

  console.log(`\n=== Importing all products for ${org.name} (${slug}) ===`)
  console.log(`    seller=${connection.sellerId}`)
  console.log(`    marketplace=${connection.marketplaceId}\n`)

  const sp = await getAmazonSPClientForOrg(org.id)

  console.log("📡 Listing FBA inventory ASINs (paginated)...")
  const asins = await sp.getFBAInventory()
  const unique = Array.from(new Set(asins))
  console.log(`   Found ${unique.length} unique ASINs.\n`)

  let imported = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < unique.length; i++) {
    const asin = unique[i]
    const prefix = `[${i + 1}/${unique.length}] ${asin}`

    try {
      const existing = await prisma.product.findUnique({
        where: { asin },
        include: { sourceImages: true },
      })

      if (existing && existing.organizationId === org.id && existing.sourceImages.length > 0) {
        console.log(`${prefix}  skip (already imported)`)
        skipped++
        continue
      }

      const amazonProduct = await sp.getProductByASIN(asin)
      if (!amazonProduct) {
        console.log(`${prefix}  not found on Amazon`)
        failed++
        continue
      }

      let sellerSku: string | null = null
      try {
        sellerSku = await sp.getSellerSKUByASIN(asin)
      } catch {
        // non-fatal
      }

      const product =
        existing ||
        (await prisma.product.create({
          data: {
            asin,
            title: amazonProduct.title,
            category: amazonProduct.productType || amazonProduct.brand,
            metadata: {
              brand: amazonProduct.brand,
              manufacturer: amazonProduct.manufacturer,
              productType: amazonProduct.productType,
              ...(sellerSku ? { sku: sellerSku } : {}),
              attributes: amazonProduct.attributes,
            },
            createdById: admin.id,
            organizationId: org.id,
          },
        }))

      if (existing && existing.organizationId !== org.id) {
        console.log(`${prefix}  WARNING: product already owned by another org — skipping to avoid clobbering`)
        skipped++
        continue
      }

      if (existing) {
        await prisma.sourceImage.deleteMany({ where: { productId: product.id } })
      }

      let savedImages = 0
      for (let j = 0; j < amazonProduct.images.length; j++) {
        const img = amazonProduct.images[j]
        try {
          const res = await downloadAndStoreImage({
            url: img.link,
            productId: product.id,
            variant: img.variant,
            order: j,
          })
          if (res.success) {
            await prisma.sourceImage.create({
              data: {
                productId: product.id,
                amazonImageUrl: img.link,
                localFilePath: res.filePath,
                imageOrder: j,
                width: res.width,
                height: res.height,
                fileSize: res.fileSize,
                variant: img.variant,
              },
            })
            savedImages++
          }
        } catch (err) {
          console.log(`${prefix}    image ${j} error: ${err instanceof Error ? err.message : err}`)
        }
      }

      console.log(`${prefix}  ✅ ${amazonProduct.title.substring(0, 60)} (${savedImages}/${amazonProduct.images.length} imgs)`)

      await prisma.activityLog.create({
        data: {
          userId: admin.id,
          action: "IMPORT_AMAZON_PRODUCT",
          entityType: "Product",
          entityId: product.id,
          metadata: { asin, title: amazonProduct.title, images: savedImages, org: slug },
        },
      })

      imported++
    } catch (err) {
      console.log(`${prefix}  ❌ ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Done. imported=${imported}  skipped=${skipped}  failed=${failed}  total=${unique.length}`)
  console.log("=".repeat(60))
}

main()
  .catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
