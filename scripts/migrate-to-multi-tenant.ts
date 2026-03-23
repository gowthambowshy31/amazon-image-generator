/**
 * Migration script: Assign existing users and products to a default organization.
 * Also creates an AmazonConnection from current .env values.
 *
 * Run with: npx tsx scripts/migrate-to-multi-tenant.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import * as dotenv from "dotenv"

dotenv.config()

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set")
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    console.log("Starting multi-tenant migration...")

    // 1. Check if migration is needed
    const usersWithoutOrg = await prisma.user.count({
      where: { organizationId: null },
    })
    const productsWithoutOrg = await prisma.product.count({
      where: { organizationId: null },
    })

    if (usersWithoutOrg === 0 && productsWithoutOrg === 0) {
      console.log("All users and products already have organizations. Nothing to do.")
      return
    }

    console.log(`Found ${usersWithoutOrg} users and ${productsWithoutOrg} products without an organization.`)

    // 2. Create default organization
    let defaultOrg = await prisma.organization.findFirst({
      where: { slug: "default" },
    })

    if (!defaultOrg) {
      defaultOrg = await prisma.organization.create({
        data: {
          name: "Default Organization",
          slug: "default",
        },
      })
      console.log(`Created default organization: ${defaultOrg.id}`)
    } else {
      console.log(`Using existing default organization: ${defaultOrg.id}`)
    }

    // 3. Assign all users without org to the default org
    if (usersWithoutOrg > 0) {
      const result = await prisma.user.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrg.id },
      })
      console.log(`Assigned ${result.count} users to default organization.`)
    }

    // 4. Assign all products without org to the default org
    if (productsWithoutOrg > 0) {
      const result = await prisma.product.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrg.id },
      })
      console.log(`Assigned ${result.count} products to default organization.`)
    }

    // 5. Create AmazonConnection from env vars if they exist
    const refreshToken = process.env.AMAZON_REFRESH_TOKEN
    const sellerId = process.env.AMAZON_SELLER_ID

    if (refreshToken && sellerId) {
      const existingConnection = await prisma.amazonConnection.findFirst({
        where: {
          organizationId: defaultOrg.id,
          sellerId: sellerId,
        },
      })

      if (!existingConnection) {
        // Store the refresh token as-is during migration
        // It will be encrypted when the user reconnects through OAuth
        await prisma.amazonConnection.create({
          data: {
            organizationId: defaultOrg.id,
            sellerId: sellerId,
            marketplaceId: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
            region: process.env.AMAZON_REGION || "na",
            refreshToken: refreshToken, // plain text during migration
            isActive: true,
            storeName: "Default Store",
          },
        })
        console.log(`Created Amazon connection for seller ${sellerId}`)
      } else {
        console.log(`Amazon connection already exists for seller ${sellerId}`)
      }
    } else {
      console.log("No AMAZON_REFRESH_TOKEN or AMAZON_SELLER_ID in env, skipping Amazon connection creation.")
    }

    console.log("\nMigration complete!")
    console.log("Summary:")
    console.log(`  Organization: ${defaultOrg.name} (${defaultOrg.slug})`)
    console.log(`  Users assigned: ${usersWithoutOrg}`)
    console.log(`  Products assigned: ${productsWithoutOrg}`)
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
