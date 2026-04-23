/**
 * Drain the QueuedRegeneration table — re-run each queued image against Gemini,
 * upload result to S3, update the batch manifest, and mark the row complete.
 * Stops cleanly when quota runs out and leaves remaining rows as QUEUED.
 */

import { prisma } from "./prisma"
import { uploadToS3 } from "./s3"
import { callGeminiImage, extForMime, GeminiRateLimitError } from "./gemini-image"
import { readManifest, writeManifest, patchVariant, type Manifest } from "./batch-manifest"
import { reserveOne, releaseOne, markExhausted, QuotaExceededError } from "./quota"

export interface DrainResult {
  attempted: number
  succeeded: number
  failed: number
  stoppedOnQuota: boolean
  errors: { id: string; message: string }[]
}

export interface DrainOptions {
  maxItems?: number
  gapMs?: number // delay between calls to stay under per-minute rate limits
}

export async function drainQueue(opts: DrainOptions = {}): Promise<DrainResult> {
  const maxItems = opts.maxItems ?? 1000
  const gapMs = opts.gapMs ?? 2500

  const result: DrainResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    stoppedOnQuota: false,
    errors: [],
  }

  const manifestCache = new Map<string, Manifest>()

  for (let i = 0; i < maxItems; i++) {
    // Pull the oldest queued row atomically (mark as RUNNING so parallel drain
    // calls can't double-process).
    const next = await prisma.queuedRegeneration.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    })
    if (!next) break

    const claimed = await prisma.queuedRegeneration.updateMany({
      where: { id: next.id, status: "QUEUED" },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    })
    if (claimed.count === 0) continue // someone else grabbed it

    result.attempted++

    try {
      await reserveOne()
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        // Put the row back in the queue and stop.
        await prisma.queuedRegeneration.update({
          where: { id: next.id },
          data: { status: "QUEUED" },
        })
        result.stoppedOnQuota = true
        break
      }
      throw err
    }

    try {
      const srcRes = await fetch(next.sourceUrl)
      if (!srcRes.ok) throw new Error(`source fetch ${srcRes.status}`)
      const srcBuf = Buffer.from(await srcRes.arrayBuffer())
      const srcMime = srcRes.headers.get("content-type") || "image/jpeg"

      const { buffer, mime } = await callGeminiImage(srcBuf, srcMime, next.prompt)

      const stem = next.original.replace(/\.[^.]+$/, "")
      const ext = extForMime(mime)
      const ts = Date.now()
      const key = `client-batches/${next.batchId}/${stem}_v${next.variantIndex}_r${ts}.${ext}`
      const up = await uploadToS3({ buffer, key, contentType: mime })
      if (!up.success || !up.url) throw new Error(up.error || "upload failed")

      // Update manifest (cache it per batch to avoid rereading for every row).
      let manifest = manifestCache.get(next.batchId)
      if (!manifest) {
        manifest = (await readManifest(next.batchId)) || undefined
        if (manifest) manifestCache.set(next.batchId, manifest)
      }
      if (manifest) {
        manifest = patchVariant(manifest, next.original, next.variantIndex, {
          status: "ok",
          url: up.url,
          key,
          error: undefined,
          queuedAt: undefined,
        })
        manifestCache.set(next.batchId, manifest)
        await writeManifest(manifest)
      }

      await prisma.queuedRegeneration.update({
        where: { id: next.id },
        data: {
          status: "COMPLETED",
          resultUrl: up.url,
          resultKey: key,
          lastError: null,
          completedAt: new Date(),
        },
      })
      result.succeeded++
    } catch (err) {
      if (err instanceof GeminiRateLimitError) {
        // Google rate-limited us even though we had quota — trust Google.
        await markExhausted()
        await releaseOne()
        await prisma.queuedRegeneration.update({
          where: { id: next.id },
          data: { status: "QUEUED", lastError: `Gemini 429: ${err.message}` },
        })
        result.stoppedOnQuota = true
        break
      }

      // Non-quota failure — roll back reservation and mark row FAILED (don't
      // loop forever on something that can't succeed).
      await releaseOne()
      const msg = (err as Error).message
      await prisma.queuedRegeneration.update({
        where: { id: next.id },
        data: { status: "FAILED", lastError: msg, completedAt: new Date() },
      })
      result.failed++
      result.errors.push({ id: next.id, message: msg })
    }

    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
  }

  return result
}
