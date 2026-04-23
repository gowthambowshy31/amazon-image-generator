/**
 * Thin wrapper around Gemini 3 Pro Image (generateContent). Shared between the
 * /api/batch/regenerate route and the queued drain job so quota accounting and
 * rate-limit parsing live in one place.
 */

export class GeminiRateLimitError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number, detail: string) {
    super(`Gemini 429 (retry in ${Math.ceil(retryAfterMs / 1000)}s): ${detail}`)
    this.name = "GeminiRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfter(text: string): number {
  const match = text.match(/retry in ([\d.]+)s/i)
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500
  return 30_000
}

export async function callGeminiImage(
  sourceBuffer: Buffer,
  sourceMime: string,
  prompt: string,
  model = "gemini-3-pro-image-preview"
): Promise<{ buffer: Buffer; mime: string }> {
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
    throw new GeminiRateLimitError(parseRetryAfter(text), text.slice(0, 200))
  }
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
  if (!part?.inlineData?.data) throw new Error("No image in Gemini response")
  return {
    buffer: Buffer.from(part.inlineData.data, "base64"),
    mime: part.inlineData.mimeType || "image/png",
  }
}

export function extForMime(mime: string): string {
  if (mime.includes("jpeg")) return "jpg"
  if (mime.includes("webp")) return "webp"
  return "png"
}
