/**
 * Build a manifest.json from what's already on S3 for a given batch and publish it.
 * Use when you want to ship the gallery without waiting for the full Gemini run.
 *
 *   tsx scripts/publish-manifest.ts 2026-04-18-jewelry
 */

import "dotenv/config"
import { config as loadDotenv } from "dotenv"
import { existsSync, readdirSync } from "fs"
import { extname, basename } from "path"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { uploadToS3 } from "../lib/s3"

const SHARED_ENV = process.env.SHARED_ENV_PATH || "C:/work/Project-kit/.env.shared"
if (existsSync(SHARED_ENV)) loadDotenv({ path: SHARED_ENV, override: false })
loadDotenv({ override: true })

const DEFAULT_PROMPT = `Enhance this image into a bright, high-end studio product photo for Amazon. Increase overall brightness and exposure while maintaining natural skin tones. Create soft, even studio lighting with a clean, luxury aesthetic. Sharpen and bring full focus to the diamond letter pendant so it is crisp, highly detailed, and sparkling without changing the composition of the floating diamond pendant without a metal base. Enhance diamond brilliance with subtle light reflections and clarity, without looking artificial. Slightly blur the background and clothing to create depth of field, ensuring the pendant is the clear focal point. Reduce shadows and remove any dull tones. Keep the chain clean, symmetrical, and refined. Output should look like professional jewelry studio photography with a premium, polished finish.`

interface Variant { index: number; url?: string; key?: string; status: "ok" | "failed"; error?: string }
interface Item { original: string; originalUrl?: string; variants: Variant[] }

async function main() {
  const batch = process.argv[2] || "2026-04-18-jewelry"
  const sourceDir = process.argv[3] || "C:/work/code/amazon-image-generator/amazon images"
  const variantsPerImage = 3

  const bucket = process.env.AWS_S3_BUCKET_NAME!
  const region = process.env.AWS_REGION || "eu-north-1"
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const sourceFiles = readdirSync(sourceDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
  const stemToFile = new Map<string, string>()
  for (const f of sourceFiles) stemToFile.set(basename(f, extname(f)), f)

  const prefix = `client-batches/${batch}/`
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    )
    for (const obj of res.Contents || []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  const itemsMap: Map<string, Item> = new Map()
  for (const file of sourceFiles) {
    itemsMap.set(file, { original: file, variants: [] })
  }

  for (const key of keys) {
    const rel = key.slice(prefix.length)
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`

    const origMatch = rel.match(/^originals\/([^/]+)\.(\w+)$/)
    if (origMatch) {
      const file = stemToFile.get(origMatch[1])
      if (file) {
        const item = itemsMap.get(file)!
        item.originalUrl = url
      }
      continue
    }

    const varMatch = rel.match(/^([^/]+)_v(\d+)\.(\w+)$/)
    if (varMatch) {
      const stem = varMatch[1]
      const n = parseInt(varMatch[2], 10)
      const file = stemToFile.get(stem)
      if (file) {
        const item = itemsMap.get(file)!
        if (!item.variants.find((v) => v.index === n)) {
          item.variants.push({ index: n, url, key, status: "ok" })
        }
      }
    }
  }

  for (const item of itemsMap.values()) {
    for (let i = 1; i <= variantsPerImage; i++) {
      if (!item.variants.find((v) => v.index === i)) {
        item.variants.push({
          index: i,
          status: "failed",
          error: "Not generated yet (free-tier quota exhausted). Will fill in once billing is enabled.",
        })
      }
    }
    item.variants.sort((a, b) => a.index - b.index)
  }

  const items = Array.from(itemsMap.values()).sort((a, b) =>
    a.original.localeCompare(b.original)
  )

  const manifest = {
    batchId: batch,
    createdAt: new Date().toISOString(),
    prompt: DEFAULT_PROMPT,
    variantsPerImage,
    items,
  }

  const manifestKey = `client-batches/${batch}/manifest.json`
  const up = await uploadToS3({
    buffer: Buffer.from(JSON.stringify(manifest, null, 2)),
    key: manifestKey,
    contentType: "application/json",
  })
  if (!up.success) throw new Error(up.error || "manifest upload failed")

  const ok = items.reduce((n, it) => n + it.variants.filter((v) => v.status === "ok").length, 0)
  const failed = items.reduce((n, it) => n + it.variants.filter((v) => v.status === "failed").length, 0)

  console.log(`Manifest published.`)
  console.log(`  ${up.url}`)
  console.log(`  images: ${items.length}`)
  console.log(`  ok variants: ${ok}  /  pending variants: ${failed}`)
  console.log(`  gallery URL (after deploy): /gallery/${batch}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
