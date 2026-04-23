import { NextRequest, NextResponse } from "next/server"
import { authenticateApiKey } from "@/lib/api-key-auth"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth.error) return auth.error

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { prompt, aspectRatio = "16:9", durationSeconds = 4, resolution = "720p" } = body

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 })
  }

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio,
          durationSeconds: parseInt(durationSeconds, 10),
          resolution,
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json(
      { error: "Failed to start video generation", details: err.slice(0, 500) },
      { status: res.status }
    )
  }

  const data = await res.json()
  const operationName = data.name
  if (!operationName) {
    return NextResponse.json({ error: "No operation name returned" }, { status: 500 })
  }

  return NextResponse.json({ operationName, status: "pending" })
}
