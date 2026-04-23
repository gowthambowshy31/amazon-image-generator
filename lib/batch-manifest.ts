/**
 * Read/write helpers for the S3-hosted manifest.json that backs each
 * /gallery/[batchId] page.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { uploadToS3 } from "./s3"

export type VariantStatus = "ok" | "failed" | "queued"

export interface ManifestVariant {
  index: number
  url?: string
  key?: string
  status: VariantStatus
  error?: string
  queuedAt?: string
}

export interface ManifestItem {
  original: string
  originalUrl?: string
  variants: ManifestVariant[]
}

export interface Manifest {
  batchId: string
  createdAt: string
  prompt: string
  variantsPerImage: number
  items: ManifestItem[]
}

function s3Config() {
  const bucket = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
  const region = process.env.AWS_REGION || "eu-north-1"
  return { bucket, region }
}

function manifestKey(batchId: string) {
  return `client-batches/${batchId}/manifest.json`
}

export async function readManifest(batchId: string): Promise<Manifest | null> {
  const { bucket, region } = s3Config()
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  })
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: manifestKey(batchId) })
    )
    const text = await res.Body?.transformToString()
    if (!text) return null
    return JSON.parse(text) as Manifest
  } catch {
    return null
  }
}

export async function writeManifest(manifest: Manifest): Promise<string> {
  const up = await uploadToS3({
    buffer: Buffer.from(JSON.stringify(manifest, null, 2)),
    key: manifestKey(manifest.batchId),
    contentType: "application/json",
  })
  if (!up.success || !up.url) throw new Error(up.error || "manifest upload failed")
  return up.url
}

/** Mutate (in memory) the variant matching (original, variantIndex) with a patch and return the new manifest. */
export function patchVariant(
  manifest: Manifest,
  original: string,
  variantIndex: number,
  patch: Partial<ManifestVariant>
): Manifest {
  const items = manifest.items.map((it) => {
    if (it.original !== original) return it
    const variants = it.variants.map((v) =>
      v.index === variantIndex ? { ...v, ...patch } : v
    )
    // If variant didn't exist at all, append it.
    if (!variants.find((v) => v.index === variantIndex)) {
      variants.push({ index: variantIndex, status: "failed", ...patch } as ManifestVariant)
      variants.sort((a, b) => a.index - b.index)
    }
    return { ...it, variants }
  })
  return { ...manifest, items }
}
