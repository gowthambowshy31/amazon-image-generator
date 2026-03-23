/**
 * Export Factory Excel Script (No DB required)
 *
 * Fetches ALL product ASINs from Amazon FBA Inventory, then for each:
 *   - Fetches parent ASIN + listing images via Catalog API
 *   - Downloads images from Amazon CDN
 *   - Uploads them to Google Drive (OAuth2 browser login, token saved locally)
 *   - Generates an Excel with Parent ASIN, Child ASIN, Image Slot, Drive Link
 *
 * Prerequisites:
 *   1. Google Cloud OAuth2 Desktop Client ID JSON (google-oauth-credentials.json)
 *   2. Google Drive API enabled in Google Cloud Console
 *
 * Environment variables:
 *   GOOGLE_OAUTH_CREDENTIALS   - path to OAuth2 client JSON (default: ./google-oauth-credentials.json)
 *   GOOGLE_DRIVE_FOLDER_ID     - the Drive folder ID to upload into
 *   AMAZON_REGION              - SP-API region (default: na)
 *   AMAZON_REFRESH_TOKEN       - SP-API refresh token
 *   AMAZON_CLIENT_ID           - SP-API app client ID
 *   AMAZON_CLIENT_SECRET       - SP-API app client secret
 *   AMAZON_MARKETPLACE_ID      - marketplace (default: ATVPDKIKX0DER)
 *   AMAZON_SELLER_ID           - seller ID (needed for inventory)
 *
 * Run with: npx tsx scripts/export-factory-excel.ts
 * Options:
 *   --asin <asin>       Export only a specific child ASIN (skip inventory fetch)
 *   --dry-run           Skip Google Drive upload, just generate Excel with Amazon image URLs
 */
import * as dotenv from "dotenv"
import * as XLSX from "xlsx"
import { google } from "googleapis"
import * as fs from "fs"
import * as path from "path"
import * as https from "https"
import * as http from "http"
import SellingPartnerAPI from "amazon-sp-api"

dotenv.config()

// ---------------------------------------------------------------------------
// Amazon SP-API
// ---------------------------------------------------------------------------
interface AmazonProductImage {
  variant: string
  link: string
  height: number
  width: number
}

function createSPClient() {
  const region = process.env.AMAZON_REGION || "na"
  const refresh_token = process.env.AMAZON_REFRESH_TOKEN
  const client_id = process.env.AMAZON_CLIENT_ID
  const client_secret = process.env.AMAZON_CLIENT_SECRET

  if (!refresh_token || !client_id || !client_secret) {
    throw new Error(
      "Missing Amazon SP-API credentials. Set AMAZON_REFRESH_TOKEN, AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET in .env"
    )
  }

  // @ts-ignore
  return new SellingPartnerAPI({
    region,
    refresh_token,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: client_id,
      SELLING_PARTNER_APP_CLIENT_SECRET: client_secret,
    },
    options: { auto_request_tokens: true, use_sandbox: false },
  })
}

/**
 * Fetch all ASINs from FBA inventory (paginated).
 * Returns array of { asin, productName }.
 */
async function fetchAllInventoryASINs(
  client: any,
  marketplaceId: string
): Promise<Array<{ asin: string; productName: string }>> {
  const items: Array<{ asin: string; productName: string }> = []
  let nextToken: string | undefined

  do {
    const query: any = {
      marketplaceIds: marketplaceId,
      granularityType: "Marketplace",
      granularityId: marketplaceId,
    }
    if (nextToken) query.nextToken = nextToken

    const response = await client.callAPI({
      operation: "getInventorySummaries",
      endpoint: "fbaInventory",
      query,
    })

    if (response?.inventorySummaries) {
      for (const item of response.inventorySummaries) {
        if (item.asin) {
          items.push({
            asin: item.asin,
            productName: item.productName || item.asin,
          })
        }
      }
    }

    nextToken = response?.nextToken
  } while (nextToken)

  return items
}

/**
 * Fetch product images + title + parent ASIN in a single API call.
 * Only keeps the largest image per variant (skips thumbnails).
 */
async function fetchProductData(
  client: any,
  asin: string,
  marketplaceId: string
): Promise<{
  title: string
  parentAsin: string | null
  images: AmazonProductImage[]
}> {
  // Use v2022-04-01 which supports relationships for parent ASIN
  const response = await client.callAPI({
    operation: "getCatalogItem",
    endpoint: "catalogItems",
    path: { asin },
    query: {
      marketplaceIds: marketplaceId,
      includedData: "images,summaries,relationships",
    },
    options: { version: "2022-04-01" },
  })

  // Parse all images, then keep only the largest per variant
  const allImages: AmazonProductImage[] = []
  if (response?.images && Array.isArray(response.images)) {
    for (const group of response.images) {
      if (group.images && Array.isArray(group.images)) {
        for (const img of group.images) {
          allImages.push({
            variant: img.variant || "MAIN",
            link: img.link,
            height: img.height || 0,
            width: img.width || 0,
          })
        }
      }
    }
  }

  // Keep only the largest image per variant (Amazon returns multiple sizes)
  const bestByVariant = new Map<string, AmazonProductImage>()
  for (const img of allImages) {
    const existing = bestByVariant.get(img.variant)
    if (!existing || img.height * img.width > existing.height * existing.width) {
      bestByVariant.set(img.variant, img)
    }
  }
  const images = Array.from(bestByVariant.values())

  // Parse title
  let title = asin
  if (response?.summaries?.[0]?.itemName) {
    title = response.summaries[0].itemName
  }

  // Extract parent ASIN from relationships (v2022-04-01)
  let parentAsin: string | null = null
  if (response?.relationships && Array.isArray(response.relationships)) {
    for (const rel of response.relationships) {
      if (rel.relationships && Array.isArray(rel.relationships)) {
        for (const r of rel.relationships) {
          if (r.parentAsins && r.parentAsins.length > 0) {
            parentAsin = r.parentAsins[0]
            break
          }
        }
        if (parentAsin) break
      }
    }
  }

  return { title, parentAsin, images }
}

// ---------------------------------------------------------------------------
// Google Drive helpers (OAuth2 browser flow)
// ---------------------------------------------------------------------------
const TOKEN_PATH = path.join(process.cwd(), "google-drive-token.json")

async function getGoogleDriveService(): Promise<ReturnType<typeof google.drive>> {
  const credPath = process.env.GOOGLE_OAUTH_CREDENTIALS || "./google-oauth-credentials.json"
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `OAuth credentials file not found at "${credPath}". ` +
      `Download the Desktop client JSON from Google Cloud Console and save it as google-oauth-credentials.json`
    )
  }

  const content = JSON.parse(fs.readFileSync(credPath, "utf-8"))
  const { client_id, client_secret, redirect_uris } = content.installed || content.web || {}
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0] || "http://localhost")

  // Check for saved token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"))
    oAuth2Client.setCredentials(token)
    // Set up auto-refresh and save
    oAuth2Client.on("tokens", (newTokens) => {
      const merged = { ...token, ...newTokens }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2))
    })
    return google.drive({ version: "v3", auth: oAuth2Client })
  }

  // No saved token — launch browser auth flow
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    prompt: "consent",
  })

  console.log("\n=== Google Drive Authorization ===")
  console.log("Open this URL in your browser:\n")
  console.log(authUrl)
  console.log("\nAfter granting access, paste the authorization code below.\n")

  // Open browser automatically (best-effort)
  try {
    const { exec } = await import("child_process")
    exec(`start "" "${authUrl}"`)
  } catch {}

  const code = await promptUser("Authorization code: ")
  const { tokens } = await oAuth2Client.getToken(code.trim())
  oAuth2Client.setCredentials(tokens)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  console.log("Token saved. You won't need to log in again.\n")

  return google.drive({ version: "v3", auth: oAuth2Client })
}

function promptUser(question: string): Promise<string> {
  const readline = require("readline")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function createDriveFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  })
  return res.data.id!
}

function downloadImageToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http
    protocol.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImageToBuffer(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks: Buffer[] = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks)))
      res.on("error", reject)
    }).on("error", reject)
  })
}

async function uploadImageToDrive(
  drive: ReturnType<typeof google.drive>,
  imageBuffer: Buffer,
  fileName: string,
  folderId: string
): Promise<string> {
  const { Readable } = await import("stream")
  const stream = new Readable()
  stream.push(imageBuffer)
  stream.push(null)

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: "image/jpeg",
      body: stream,
    },
    fields: "id,webViewLink",
  })

  // Make file accessible to anyone with the link
  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  })

  return `https://drive.google.com/file/d/${res.data.id}/view`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const singleAsin = getArg(args, "--asin")
  const dryRun = args.includes("--dry-run")
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"

  console.log("=== Factory Image Export (API-only, no DB) ===")
  console.log(`  ASIN filter: ${singleAsin || "all (from FBA inventory)"}`)
  console.log(`  Marketplace: ${marketplaceId}`)
  console.log(`  Dry run: ${dryRun}`)
  console.log("")

  // Create Amazon SP-API client
  const spClient = createSPClient()

  // Get list of ASINs to process
  let asinList: Array<{ asin: string; productName: string }>

  if (singleAsin) {
    asinList = [{ asin: singleAsin, productName: singleAsin }]
  } else {
    console.log("Fetching FBA inventory...")
    asinList = await fetchAllInventoryASINs(spClient, marketplaceId)
    // Deduplicate by ASIN (inventory can have multiple SKUs per ASIN)
    const seen = new Set<string>()
    asinList = asinList.filter((item) => {
      if (seen.has(item.asin)) return false
      seen.add(item.asin)
      return true
    })
    console.log(`Found ${asinList.length} unique ASIN(s) in inventory.\n`)
  }

  if (asinList.length === 0) {
    console.log("No ASINs to export.")
    return
  }

  // Google Drive setup (skip if dry run)
  let drive: ReturnType<typeof google.drive> | null = null
  let rootFolderId: string | null = null

  if (!dryRun) {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set")
    drive = await getGoogleDriveService()
    const timestamp = new Date().toISOString().slice(0, 10)
    rootFolderId = await createDriveFolder(drive, `Factory Export ${timestamp}`, folderId)
    console.log(`Created Google Drive folder: Factory Export ${timestamp}\n`)
  }

  // Process each ASIN
  const excelRows: Array<{
    parentAsin: string
    childAsin: string
    title: string
    variant: string
    driveLink: string
  }> = []

  for (let i = 0; i < asinList.length; i++) {
    const { asin, productName } = asinList[i]
    console.log(`[${i + 1}/${asinList.length}] ${asin} — ${productName}`)

    // Fetch everything from Amazon Catalog API in one call
    let productData: { title: string; parentAsin: string | null; images: AmazonProductImage[] }
    try {
      productData = await fetchProductData(spClient, asin, marketplaceId)
    } catch (err: any) {
      console.error(`  x Failed to fetch from Amazon: ${(err as Error).message}`)
      excelRows.push({
        parentAsin: "",
        childAsin: asin,
        title: productName,
        variant: "ERROR",
        driveLink: `API Error: ${(err as Error).message}`,
      })
      await sleep(2000) // back off on errors
      continue
    }

    console.log(`  Parent ASIN: ${productData.parentAsin || "N/A (standalone)"}`)
    console.log(`  Images: ${productData.images.length}`)

    if (productData.images.length === 0) {
      excelRows.push({
        parentAsin: productData.parentAsin || "",
        childAsin: asin,
        title: productData.title,
        variant: "N/A",
        driveLink: "No images found",
      })
      await sleep(500)
      continue
    }

    // Create per-product subfolder in Drive
    let productFolderId: string | null = null
    if (drive && rootFolderId) {
      productFolderId = await createDriveFolder(
        drive,
        `${asin} - ${productData.title.slice(0, 50)}`,
        rootFolderId
      )
    }

    for (const img of productData.images) {
      const fileName = `${asin}_${img.variant}.jpg`
      let driveLink = img.link // fallback: raw Amazon URL

      if (!dryRun && drive && productFolderId) {
        try {
          console.log(`    Downloading ${img.variant}...`)
          const imageBuffer = await downloadImageToBuffer(img.link)
          console.log(`    Uploading ${fileName} to Drive...`)
          driveLink = await uploadImageToDrive(drive, imageBuffer, fileName, productFolderId)
          console.log(`    Done: ${driveLink}`)
        } catch (err) {
          console.error(`    Failed ${img.variant}: ${(err as Error).message}`)
          driveLink = `ERROR: ${(err as Error).message}`
        }
      } else if (dryRun) {
        console.log(`    [dry-run] ${img.variant}: ${img.link}`)
      }

      excelRows.push({
        parentAsin: productData.parentAsin || "",
        childAsin: asin,
        title: productData.title,
        variant: img.variant,
        driveLink,
      })
    }

    // Rate-limit between products to avoid Amazon API throttling
    if (i < asinList.length - 1) {
      await sleep(1000)
    }
  }

  // Generate Excel
  console.log(`\nGenerating Excel with ${excelRows.length} rows...`)

  const wsData = [
    ["Parent ASIN", "Child ASIN", "Product Title", "Image Slot", "Image Link"],
    ...excelRows.map((r) => [r.parentAsin, r.childAsin, r.title, r.variant, r.driveLink]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [
    { wch: 14 }, // Parent ASIN
    { wch: 14 }, // Child ASIN
    { wch: 50 }, // Title
    { wch: 12 }, // Image Slot
    { wch: 60 }, // Image Link
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Factory Images")

  const outputDir = path.join(process.cwd(), "exports")
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().slice(0, 10)
  const outputFile = path.join(outputDir, `factory-images-${timestamp}.xlsx`)
  XLSX.writeFile(wb, outputFile)

  console.log(`\nDone! Excel saved to: ${outputFile}`)
  console.log(`Total rows: ${excelRows.length}`)
  if (!dryRun && rootFolderId) {
    console.log(`Google Drive folder: https://drive.google.com/drive/folders/${rootFolderId}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
