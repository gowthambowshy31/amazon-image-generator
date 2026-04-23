import { NextRequest, NextResponse } from "next/server"
import { uploadToS3 } from "@/lib/s3"
import { callGeminiImage, extForMime, GeminiRateLimitError } from "@/lib/gemini-image"
import { readManifest, writeManifest, patchVariant } from "@/lib/batch-manifest"
import {
  reserveOne,
  releaseOne,
  markExhausted,
  getQuotaSnapshot,
  QuotaExceededError,
} from "@/lib/quota"
import { prisma } from "@/lib/prisma"

interface RegenerateBody {
  batchId: string
  original: string
  variantIndex: number
  prompt: string
  sourceUrl: string
}

async function queueForLater(body: RegenerateBody, reason: string) {
  // Upsert the queue row (one per batch+original+variant).
  await prisma.queuedRegeneration.upsert({
    where: {
      batchId_original_variantIndex: {
        batchId: body.batchId,
        original: body.original,
        variantIndex: body.variantIndex,
      },
    },
    create: {
      batchId: body.batchId,
      original: body.original,
      variantIndex: body.variantIndex,
      prompt: body.prompt,
      sourceUrl: body.sourceUrl,
      lastError: reason,
    },
    update: {
      prompt: body.prompt,
      sourceUrl: body.sourceUrl,
      status: "QUEUED",
      lastError: reason,
    },
  })

  // Flip the variant to "queued" in the S3 manifest so the gallery shows it
  // as pending rather than failed.
  const manifest = await readManifest(body.batchId)
  if (manifest) {
    const patched = patchVariant(manifest, body.original, body.variantIndex, {
      status: "queued",
      queuedAt: new Date().toISOString(),
      error: undefined,
    })
    await writeManifest(patched)
  }
}

export async function POST(request: NextRequest) {
  let body: RegenerateBody
  try {
    body = (await request.json()) as RegenerateBody
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const { batchId, original, variantIndex, prompt, sourceUrl } = body
  if (!batchId || !original || !variantIndex || !prompt || !sourceUrl) {
    return NextResponse.json(
      { error: "batchId, original, variantIndex, prompt, sourceUrl required" },
      { status: 400 }
    )
  }

  // Pre-flight: do we have quota left?
  let snapshot
  try {
    snapshot = await reserveOne()
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await queueForLater(body, "Daily quota exhausted — queued for next reset.")
      const q = await getQuotaSnapshot()
      return NextResponse.json(
        {
          queued: true,
          reason: "quota_exhausted",
          message: "Daily image quota reached. Queued for next reset.",
          quota: q,
        },
        { status: 429 }
      )
    }
    throw err
  }

  try {
    const srcRes = await fetch(sourceUrl)
    if (!srcRes.ok) throw new Error(`source fetch ${srcRes.status}`)
    const srcBuf = Buffer.from(await srcRes.arrayBuffer())
    const srcMime = srcRes.headers.get("content-type") || "image/jpeg"

    const { buffer, mime } = await callGeminiImage(srcBuf, srcMime, prompt)

    const stem = original.replace(/\.[^.]+$/, "")
    const ext = extForMime(mime)
    const ts = Date.now()
    const key = `client-batches/${batchId}/${stem}_v${variantIndex}_r${ts}.${ext}`

    const up = await uploadToS3({ buffer, key, contentType: mime })
    if (!up.success || !up.url) throw new Error(up.error || "upload failed")

    // Update the manifest to reflect the new variant URL/status.
    const manifest = await readManifest(batchId)
    if (manifest) {
      const patched = patchVariant(manifest, original, variantIndex, {
        status: "ok",
        url: up.url,
        key,
        error: undefined,
        queuedAt: undefined,
      })
      await writeManifest(patched)
    }

    // Clear any queue entry that was waiting for this slot.
    await prisma.queuedRegeneration.updateMany({
      where: { batchId, original, variantIndex, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "COMPLETED",
        resultUrl: up.url,
        resultKey: key,
        completedAt: new Date(),
      },
    })

    return NextResponse.json({ url: up.url, key, quota: { ...snapshot, used: snapshot.used, remaining: snapshot.remaining } })
  } catch (err) {
    console.error("regenerate error:", err)

    if (err instanceof GeminiRateLimitError) {
      // Google says we're out even though our local counter disagreed — trust Google.
      await markExhausted()
      await releaseOne() // rollback the reservation we made
      await queueForLater(body, `Gemini 429: ${err.message}`)
      const q = await getQuotaSnapshot()
      return NextResponse.json(
        {
          queued: true,
          reason: "rate_limited",
          message: "Gemini rate-limited the request. Queued for next reset.",
          quota: q,
        },
        { status: 429 }
      )
    }

    // Any other failure — reservation should be released (the request didn't
    // actually produce an image). The caller still sees a 500.
    await releaseOne()
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
