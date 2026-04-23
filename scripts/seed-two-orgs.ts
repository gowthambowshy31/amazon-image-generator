/**
 * Seed two Amazon seller organizations from env credentials.
 *
 *   Privosa     -> AMAZON_*    env (AMAZON_CLIENT_ID / SECRET / REFRESH_TOKEN / SELLER_ID / MARKETPLACE_ID)
 *   Purple Kiwi -> AMAZON_B_*  env (AMAZON_B_CLIENT_ID / SECRET / REFRESH_TOKEN / MARKETPLACE_ID, optional AMAZON_B_SELLER_ID)
 *
 * Run with: npx tsx scripts/seed-two-orgs.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"
import * as dotenv from "dotenv"
import { encrypt } from "../lib/encryption"

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface OrgDefinition {
  slug: string
  name: string
  adminEmail: string
  adminName: string
  adminPassword: string
  storeName: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  sellerId?: string
  marketplaceId?: string
  region?: string
}

async function upsertOrg(def: OrgDefinition) {
  console.log(`\n=== ${def.name} (${def.slug}) ===`)

  if (!def.refreshToken || !def.clientId || !def.clientSecret) {
    console.log(`  ⚠️  Missing credentials — skipping. Set env vars and re-run.`)
    return
  }

  const org = await prisma.organization.upsert({
    where: { slug: def.slug },
    update: { name: def.name },
    create: { slug: def.slug, name: def.name },
  })
  console.log(`  ✅ Organization: ${org.name} (${org.id})`)

  const password = await bcrypt.hash(def.adminPassword, 10)
  const user = await prisma.user.upsert({
    where: { email: def.adminEmail },
    update: { password, organizationId: org.id, role: "ADMIN" },
    create: {
      email: def.adminEmail,
      name: def.adminName,
      password,
      role: "ADMIN",
      organizationId: org.id,
    },
  })
  console.log(`  ✅ Admin user: ${user.email}`)

  const sellerId = def.sellerId || `${def.slug.toUpperCase()}_PLACEHOLDER`
  const encRefresh = encrypt(def.refreshToken)
  const encSecret = encrypt(def.clientSecret)

  const existing = await prisma.amazonConnection.findFirst({
    where: { organizationId: org.id, sellerId },
  })

  if (existing) {
    await prisma.amazonConnection.update({
      where: { id: existing.id },
      data: {
        refreshToken: encRefresh,
        clientId: def.clientId,
        clientSecret: encSecret,
        marketplaceId: def.marketplaceId || "ATVPDKIKX0DER",
        region: def.region || "na",
        isActive: true,
        storeName: def.storeName,
      },
    })
    console.log(`  ✅ AmazonConnection updated (sellerId=${sellerId})`)
  } else {
    await prisma.amazonConnection.create({
      data: {
        organizationId: org.id,
        sellerId,
        marketplaceId: def.marketplaceId || "ATVPDKIKX0DER",
        region: def.region || "na",
        refreshToken: encRefresh,
        clientId: def.clientId,
        clientSecret: encSecret,
        storeName: def.storeName,
        isActive: true,
      },
    })
    console.log(`  ✅ AmazonConnection created (sellerId=${sellerId})`)
  }
}

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY must be set to encrypt refresh tokens")
  }

  await upsertOrg({
    slug: "privosa",
    name: "Privosa",
    adminEmail: "gowtham@privosa.com",
    adminName: "Gowtham",
    adminPassword: "Privosa@123",
    storeName: "Privosa",
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
    refreshToken: process.env.AMAZON_REFRESH_TOKEN,
    sellerId: process.env.AMAZON_SELLER_ID,
    marketplaceId: process.env.AMAZON_MARKETPLACE_ID,
    region: process.env.AMAZON_REGION,
  })

  await upsertOrg({
    slug: "purplekiwi",
    name: "Purple Kiwi",
    adminEmail: "gowtham@purplekiwi.com",
    adminName: "Gowtham (Purple Kiwi)",
    adminPassword: "PurpleKiwi@123",
    storeName: "Purple Kiwi",
    clientId: process.env.AMAZON_B_CLIENT_ID,
    clientSecret: process.env.AMAZON_B_CLIENT_SECRET,
    refreshToken: process.env.AMAZON_B_REFRESH_TOKEN,
    sellerId: process.env.AMAZON_B_SELLER_ID,
    marketplaceId: process.env.AMAZON_B_MARKETPLACE_ID,
    region: process.env.AMAZON_B_REGION,
  })

  console.log("\n🎉 Done.")
  console.log("\nCredentials:")
  console.log("  Privosa admin     : gowtham@privosa.com     / Privosa@123")
  console.log("  Purple Kiwi admin : gowtham@purplekiwi.com  / PurpleKiwi@123")
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
