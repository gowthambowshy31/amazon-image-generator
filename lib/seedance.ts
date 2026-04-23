/**
 * Seedance (ByteDance / Volcengine Ark) video generation client.
 *
 * Official Ark endpoints:
 *   POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
 *   GET  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}
 *
 * Auth: `Authorization: Bearer <ARK_API_KEY>`
 *
 * Default model: doubao-seedance-1-0-pro-250528
 */

const ARK_BASE_URL =
  process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"

export const SEEDANCE_DEFAULT_MODEL =
  process.env.SEEDANCE_MODEL || "doubao-seedance-1-0-pro-250528"

export type SeedanceRatio =
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9"
  | "adaptive"

export type SeedanceResolution = "480p" | "720p" | "1080p"

export interface SeedanceImageInput {
  url: string
  role?: "first_frame" | "last_frame" | "reference_image"
}

export interface SeedanceCreateTaskInput {
  prompt: string
  model?: string
  ratio?: SeedanceRatio
  resolution?: SeedanceResolution
  duration?: number
  seed?: number
  watermark?: boolean
  camerafixed?: boolean
  images?: SeedanceImageInput[]
}

export interface SeedanceTaskCreated {
  id: string
}

export type SeedanceTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"

export interface SeedanceTask {
  id: string
  status: SeedanceTaskStatus
  model?: string
  content?: { video_url?: string }
  error?: { code?: string; message?: string }
  created_at?: number
  updated_at?: number
}

function getApiKey(): string {
  const apiKey = process.env.ARK_API_KEY || process.env.SEEDANCE_API_KEY
  if (!apiKey) {
    throw new Error(
      "ARK_API_KEY (or SEEDANCE_API_KEY) is not set. Get one from https://console.volcengine.com/ark"
    )
  }
  return apiKey
}

export async function createSeedanceTask(
  input: SeedanceCreateTaskInput
): Promise<SeedanceTaskCreated> {
  const apiKey = getApiKey()

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
  ]
  for (const img of input.images || []) {
    content.push({
      type: "image_url",
      image_url: { url: img.url },
      ...(img.role ? { role: img.role } : {}),
    })
  }

  const body: Record<string, unknown> = {
    model: input.model || SEEDANCE_DEFAULT_MODEL,
    content,
    ratio: input.ratio || "16:9",
    resolution: input.resolution || "720p",
    duration: input.duration ?? 5,
    watermark: input.watermark ?? false,
  }
  if (typeof input.seed === "number") body.seed = input.seed
  if (typeof input.camerafixed === "boolean") body.camerafixed = input.camerafixed

  const res = await fetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(
      `Seedance create-task failed (${res.status}): ${errText.slice(0, 500)}`
    )
  }

  const data = (await res.json()) as SeedanceTaskCreated
  if (!data.id) {
    throw new Error(
      `Seedance create-task returned no id: ${JSON.stringify(data).slice(0, 200)}`
    )
  }
  return data
}

export async function getSeedanceTask(taskId: string): Promise<SeedanceTask> {
  const apiKey = getApiKey()
  const res = await fetch(
    `${ARK_BASE_URL}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(
      `Seedance get-task failed (${res.status}): ${errText.slice(0, 500)}`
    )
  }
  return (await res.json()) as SeedanceTask
}

/**
 * Fetch an image (local file via /api/uploads, absolute URL, or file system path)
 * and return a `data:image/...;base64,...` URI suitable for passing into
 * Seedance's image_url field.
 */
export async function toDataUri(input: {
  absolutePath?: string
  httpUrl?: string
  mimeHint?: string
}): Promise<string> {
  const { readFile } = await import("fs/promises")
  let buffer: Buffer
  let mime = input.mimeHint || "image/jpeg"

  if (input.absolutePath) {
    buffer = await readFile(input.absolutePath)
    if (/\.png$/i.test(input.absolutePath)) mime = "image/png"
    else if (/\.webp$/i.test(input.absolutePath)) mime = "image/webp"
    else if (/\.jpe?g$/i.test(input.absolutePath)) mime = "image/jpeg"
  } else if (input.httpUrl) {
    const r = await fetch(input.httpUrl)
    if (!r.ok) throw new Error(`Failed to fetch image: ${input.httpUrl}`)
    const ct = r.headers.get("content-type")
    if (ct) mime = ct.split(";")[0]
    buffer = Buffer.from(await r.arrayBuffer())
  } else {
    throw new Error("toDataUri: no input provided")
  }

  return `data:${mime};base64,${buffer.toString("base64")}`
}
