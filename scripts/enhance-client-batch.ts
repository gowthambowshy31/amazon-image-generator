/**
 * Enhance a folder of client images via Gemini 3 Pro Image and upload all variants to S3.
 *
 * Usage:
 *   tsx scripts/enhance-client-batch.ts \
 *     --input "C:/work/code/amazon-image-generator/amazon images" \
 *     --batch 2026-04-18-jewelry \
 *     --variants 3 \
 *     --concurrency 5
 *
 * All flags optional. Defaults match the current jewelry brief.
 */

import "dotenv/config"
import { config as loadDotenv } from "dotenv"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { resolve, extname, basename } from "path"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { uploadToS3 } from "../lib/s3"

// Load shared env first, then local .env (local wins)
const SHARED_ENV = process.env.SHARED_ENV_PATH || "C:/work/Project-kit/.env.shared"
if (existsSync(SHARED_ENV)) loadDotenv({ path: SHARED_ENV, override: false })
loadDotenv({ override: true })

const DEFAULT_PROMPT = `Enhance this image into a bright, high-end studio product photo for Amazon. Increase overall brightness and exposure while maintaining natural skin tones. Create soft, even studio lighting with a clean, luxury aesthetic. Sharpen and bring full focus to the diamond letter pendant so it is crisp, highly detailed, and sparkling without changing the composition of the floating diamond pendant without a metal base. Enhance diamond brilliance with subtle light reflections and clarity, without looking artificial. Slightly blur the background and clothing to create depth of field, ensuring the pendant is the clear focal point. Reduce shadows and remove any dull tones. Keep the chain clean, symmetrical, and refined. Output should look like professional jewelry studio photography with a premium, polished finish.`

interface Args {
  input: string
  batch: string
  variants: number
  concurrency: number
  prompt: string
  model: string
  force: boolean
  gapMs: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const has = (flag: string) => argv.includes(flag)
  const today = new Date().toISOString().slice(0, 10)
  return {
    input: get("--input", "C:/work/code/amazon-image-generator/amazon images")!,
    batch: get("--batch", `${today}-jewelry`)!,
    variants: Number(get("--variants", "3")),
    concurrency: Number(get("--concurrency", "5")),
    prompt: get("--prompt", DEFAULT_PROMPT)!,
    model: get("--model", "nano-banana-pro-preview")!,
    force: has("--force"),
    gapMs: Number(get("--gap-ms", "1500")),
  }
}

function mimeFor(file: string): string {
  const ext = extname(file).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".png") return "image/png"
  if (ext === ".webp") return "image/webp"
  return "image/jpeg"
}

/**
 * Serialized rate limiter. The effective gap between calls is set from --gap-ms
 * at startup. Paid tier for nano-banana-pro handles ~60 RPM (1s gap); free tier
 * for preview image models required ~10s gap to stay under quota.
 */
let MIN_GAP_MS = 10_000
let rateGate: Promise<void> = Promise.resolve()
let lastCallAt = 0

async function acquireRateToken(): Promise<void> {
  const prev = rateGate
  let release!: () => void
  rateGate = new Promise((r) => (release = r))
  await prev
  try {
    const now = Date.now()
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - now)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCallAt = Date.now()
  } finally {
    release()
  }
}

class RateLimitError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number, detail: string) {
    super(`Gemini 429 (retry in ${Math.ceil(retryAfterMs / 1000)}s): ${detail}`)
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfter(text: string): number {
  // Gemini error body: "Please retry in 42.07s" — take the largest number we find
  const match = text.match(/retry in ([\d.]+)s/i)
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500
  return 30_000
}

async function callGemini(sourceBuffer: Buffer, sourceMime: string, prompt: string, model: string = "nano-banana-pro-preview"): Promise<{ buffer: Buffer; mime: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { data: sourceBuffer.toString("base64"), mimeType: sourceMime } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { responseModalities: ["image", "text"] },
  }

  await acquireRateToken()

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (res.status === 429) {
    const text = await res.text()
    throw new RateLimitError(parseRetryAfter(text), text.slice(0, 200))
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 500)}`)
  }

  const data = await res.json()
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
  if (!part?.inlineData?.data) {
    throw new Error(`No image in Gemini response: ${JSON.stringify(data).slice(0, 300)}`)
  }
  const mime: string = part.inlineData.mimeType || "image/png"
  return { buffer: Buffer.from(part.inlineData.data, "base64"), mime }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 6, label = ""): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      let wait: number
      if (err instanceof RateLimitError) {
        wait = err.retryAfterMs
      } else {
        wait = Math.min(2000 * 2 ** (i - 1), 30_000)
      }
      console.warn(`  retry ${i}/${attempts} for ${label} after ${wait}ms: ${(err as Error).message.slice(0, 120)}`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

interface VariantResult { index: number; url?: string; key?: string; status: "ok" | "failed"; error?: string }
interface ItemResult { original: string; originalUrl?: string; variants: VariantResult[] }

async function loadExistingManifest(batch: string): Promise<Record<string, ItemResult> | null> {
  const bucket = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
  const region = process.env.AWS_REGION || "eu-north-1"
  const url = `https://${bucket}.s3.${region}.amazonaws.com/client-batches/${batch}/manifest.json`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    const map: Record<string, ItemResult> = {}
    for (const item of json.items || []) map[item.original] = item
    return map
  } catch {
    return null
  }
}

/**
 * List all existing objects under client-batches/{batch}/ and build a map of
 * {original: ItemResult} based on filenames. This lets us resume from objects
 * already uploaded even if the manifest was never finalised.
 */
async function scanS3ForExisting(batch: string, sourceFiles: string[]): Promise<Record<string, ItemResult>> {
  const bucket = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
  const region = process.env.AWS_REGION || "eu-north-1"
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  })

  const prefix = `client-batches/${batch}/`
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
    for (const obj of res.Contents || []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  const map: Record<string, ItemResult> = {}
  const fileStems = new Set(sourceFiles.map((f) => basename(f, extname(f))))

  // originals/<stem>.<ext>
  for (const key of keys) {
    const m = key.match(/originals\/([^/]+)\.(\w+)$/)
    if (!m) continue
    const stem = m[1]
    if (!fileStems.has(stem)) continue
    const original = sourceFiles.find((f) => basename(f, extname(f)) === stem)
    if (!original) continue
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    map[original] = map[original] || { original, variants: [] }
    map[original].originalUrl = url
  }

  // <stem>_v<n>.<ext> at the root of the batch prefix (skip originals/ and regens)
  for (const key of keys) {
    const rel = key.slice(prefix.length)
    if (rel.startsWith("originals/")) continue
    const m = rel.match(/^(.+)_v(\d+)\.(\w+)$/)
    if (!m) continue
    const stem = m[1]
    const n = parseInt(m[2], 10)
    if (!fileStems.has(stem)) continue
    const original = sourceFiles.find((f) => basename(f, extname(f)) === stem)
    if (!original) continue
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    map[original] = map[original] || { original, variants: [] }
    // keep the first one we see per variant index (list order is alpha; _r<ts> regens sort after)
    if (!map[original].variants.find((v) => v.index === n)) {
      map[original].variants.push({ index: n, url, key, status: "ok" })
    }
  }

  return map
}

function writeManifestIncremental(batch: string, manifest: any) {
  try {
    const local = resolve(process.cwd(), `manifest-${batch}.json`)
    writeFileSync(local, JSON.stringify(manifest, null, 2))
  } catch {}
}

async function processOne(file: string, sourceDir: string, args: Args, existing: ItemResult | undefined): Promise<ItemResult> {
  const absPath = resolve(sourceDir, file)
  const buf = readFileSync(absPath)
  const mime = mimeFor(file)
  const stem = basename(file, extname(file))
  const ext = extname(file).toLowerCase().replace(".", "") || "jpg"

  let originalUrl = existing?.originalUrl
  if (!originalUrl) {
    const originalKey = `client-batches/${args.batch}/originals/${stem}.${ext}`
    const originalUpload = await withRetry(
      () => uploadToS3({ buffer: buf, key: originalKey, contentType: mime }),
      3,
      `upload original ${file}`
    )
    originalUrl = originalUpload.success ? originalUpload.url : undefined
  }

  const existingOk = new Map<number, VariantResult>()
  if (existing) {
    for (const v of existing.variants) {
      if (v.status === "ok" && v.url) existingOk.set(v.index, v)
    }
  }

  const needed = Array.from({ length: args.variants }, (_, i) => i + 1).filter((n) => !existingOk.has(n))
  if (existingOk.size > 0) {
    console.log(`[${file}] reusing ${existingOk.size} existing variants; generating ${needed.length} new...`)
  } else {
    console.log(`[${file}] generating ${args.variants} variants...`)
  }

  const newResults = await Promise.all(
    needed.map(async (n): Promise<VariantResult> => {
      try {
        const { buffer, mime: outMime } = await withRetry(
          () => callGemini(buf, mime, args.prompt, args.model),
          6,
          `${file} v${n}`
        )
        const outExt = outMime.includes("jpeg") ? "jpg" : outMime.includes("webp") ? "webp" : "png"
        const key = `client-batches/${args.batch}/${stem}_v${n}.${outExt}`
        const up = await withRetry(
          () => uploadToS3({ buffer, key, contentType: outMime }),
          3,
          `upload ${key}`
        )
        if (!up.success || !up.url) throw new Error(up.error || "upload failed")
        console.log(`  [${file}] v${n} -> ${up.url}`)
        return { index: n, url: up.url, key, status: "ok" }
      } catch (err) {
        const msg = (err as Error).message
        console.error(`  [${file}] v${n} FAILED: ${msg}`)
        return { index: n, status: "failed", error: msg }
      }
    })
  )

  const allVariants: VariantResult[] = []
  for (let i = 1; i <= args.variants; i++) {
    const reused = existingOk.get(i)
    if (reused) {
      allVariants.push(reused)
    } else {
      const found = newResults.find((r) => r.index === i)
      if (found) allVariants.push(found)
    }
  }

  return { original: file, originalUrl, variants: allVariants }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const args = parseArgs()
  MIN_GAP_MS = args.gapMs

  if (!existsSync(args.input)) {
    throw new Error(`Input folder not found: ${args.input}`)
  }
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set")
  if (!process.env.AWS_ACCESS_KEY_ID) throw new Error("AWS_ACCESS_KEY_ID not set")

  const files = readdirSync(args.input)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()

  console.log(`Batch: ${args.batch}`)
  console.log(`Model: ${args.model}`)
  console.log(`Input: ${args.input}`)
  console.log(`Files: ${files.length}`)
  console.log(`Variants per image: ${args.variants}`)
  console.log(`Concurrency (images in flight): ${args.concurrency}`)
  console.log(`Total Gemini calls: ${files.length * args.variants}`)
  console.log(`Force re-generate: ${args.force}`)
  console.log("")

  let existingMap: Record<string, ItemResult> = {}
  if (args.force) {
    console.log("--force enabled: regenerating all variants regardless of existing S3 objects.")
    console.log("")
  } else {
    const manifestExisting = await loadExistingManifest(args.batch)
    const s3Existing = await scanS3ForExisting(args.batch, files)
    existingMap = { ...s3Existing, ...(manifestExisting || {}) }

    const okReused = Object.values(existingMap).reduce(
      (n, it) => n + it.variants.filter((v) => v.status === "ok" && v.url).length,
      0
    )
    if (okReused > 0) {
      console.log(`Found ${okReused} ok variants already uploaded — will reuse and only generate missing ones.`)
      console.log("")
    }
  }

  const results: ItemResult[] = []
  const started = Date.now()

  const incrementalManifest = () => ({
    batchId: args.batch,
    createdAt: new Date().toISOString(),
    prompt: args.prompt,
    variantsPerImage: args.variants,
    items: [...results].sort((a, b) => a.original.localeCompare(b.original)),
  })

  await runPool(files, args.concurrency, async (file, i) => {
    const item = await processOne(file, args.input, args, existingMap[file])
    results.push(item)
    writeManifestIncremental(args.batch, incrementalManifest())
    const done = results.length
    const elapsedMin = (Date.now() - started) / 60000
    const rate = done / elapsedMin
    const eta = rate > 0 ? ((files.length - done) / rate).toFixed(1) : "?"
    console.log(`progress: ${done}/${files.length}  elapsed=${elapsedMin.toFixed(1)}min  eta=${eta}min`)
  })

  results.sort((a, b) => a.original.localeCompare(b.original))

  const manifest = {
    batchId: args.batch,
    createdAt: new Date().toISOString(),
    prompt: args.prompt,
    variantsPerImage: args.variants,
    items: results,
  }

  const manifestKey = `client-batches/${args.batch}/manifest.json`
  const up = await uploadToS3({
    buffer: Buffer.from(JSON.stringify(manifest, null, 2)),
    key: manifestKey,
    contentType: "application/json",
  })
  if (!up.success) throw new Error(`manifest upload failed: ${up.error}`)

  const okCount = results.reduce((n, r) => n + r.variants.filter((v) => v.status === "ok").length, 0)
  const failCount = results.reduce((n, r) => n + r.variants.filter((v) => v.status === "failed").length, 0)

  console.log("")
  console.log(`DONE. ok=${okCount} failed=${failCount}`)
  console.log(`Manifest: ${up.url}`)
  console.log(`Gallery URL (after deploy): /gallery/${args.batch}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
