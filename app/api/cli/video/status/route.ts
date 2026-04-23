import { NextRequest, NextResponse } from "next/server"
import { authenticateApiKey } from "@/lib/api-key-auth"
import { uploadToS3 } from "@/lib/s3"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth.error) return auth.error

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { operationName } = body
  if (!operationName) {
    return NextResponse.json({ error: "operationName required" }, { status: 400 })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
    { headers: { "x-goog-api-key": apiKey } }
  )
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json(
      { error: "Failed to check status", details: err.slice(0, 500) },
      { status: res.status }
    )
  }

  const data = await res.json()

  if (!data.done) {
    return NextResponse.json({ done: false, operationName })
  }

  const videoBytes =
    data?.response?.generatedSamples?.[0]?.video?.encodedVideo ||
    data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.encodedVideo

  if (!videoBytes) {
    return NextResponse.json(
      { done: true, error: "No video data in response", raw: data },
      { status: 500 }
    )
  }

  const buffer = Buffer.from(videoBytes, "base64")
  const key = `cli-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const up = await uploadToS3({ buffer, key, contentType: "video/mp4" })
  if (!up.success || !up.url) {
    return NextResponse.json({ done: true, error: up.error || "upload failed" }, { status: 500 })
  }

  return NextResponse.json({
    done: true,
    url: up.url,
    key,
    size: buffer.length,
  })
}
