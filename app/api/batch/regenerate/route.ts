import { NextRequest, NextResponse } from "next/server"
import { uploadToS3 } from "@/lib/s3"

async function callGemini(sourceBuffer: Buffer, sourceMime: string, prompt: string) {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
  if (!part?.inlineData?.data) throw new Error("No image in response")
  const outMime: string = part.inlineData.mimeType || "image/png"
  return { buffer: Buffer.from(part.inlineData.data, "base64"), mime: outMime }
}

export async function POST(request: NextRequest) {
  try {
    const { batchId, original, variantIndex, prompt, sourceUrl } = await request.json() as {
      batchId: string
      original: string
      variantIndex: number
      prompt: string
      sourceUrl: string
    }

    if (!batchId || !original || !variantIndex || !prompt || !sourceUrl) {
      return NextResponse.json({ error: "batchId, original, variantIndex, prompt, sourceUrl required" }, { status: 400 })
    }

    const srcRes = await fetch(sourceUrl)
    if (!srcRes.ok) throw new Error(`source fetch ${srcRes.status}`)
    const srcBuf = Buffer.from(await srcRes.arrayBuffer())
    const srcMime = srcRes.headers.get("content-type") || "image/jpeg"

    const { buffer, mime } = await callGemini(srcBuf, srcMime, prompt)

    const stem = original.replace(/\.[^.]+$/, "")
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png"
    const ts = Date.now()
    const key = `client-batches/${batchId}/${stem}_v${variantIndex}_r${ts}.${ext}`

    const up = await uploadToS3({ buffer, key, contentType: mime })
    if (!up.success || !up.url) throw new Error(up.error || "upload failed")

    return NextResponse.json({ url: up.url, key })
  } catch (err) {
    console.error("regenerate error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
