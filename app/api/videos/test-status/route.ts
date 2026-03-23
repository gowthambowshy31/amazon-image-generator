import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/videos/test-status?operationName=XXX - Test endpoint to see raw API response
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const operationName = searchParams.get('operationName')

    if (!operationName) {
      return NextResponse.json(
        { error: "operationName query parameter is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      )
    }

    console.log('🔍 Testing video status for:', operationName)

    // Check operation status
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey
        }
      }
    )

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      console.error('API Error:', errorData)
      return NextResponse.json(
        {
          error: "API request failed",
          status: response.status,
          details: errorData
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    console.log('📦 Full Response:', JSON.stringify(data, null, 2))
    console.log('🔑 Top-level keys:', Object.keys(data))

    if (data.done) {
      console.log('✅ Operation is complete')
      console.log('🔍 Checking for video data...')

      // Check various possible locations
      const checks = {
        'data.response?.predictions?.[0]?.bytesBase64Encoded': data.response?.predictions?.[0]?.bytesBase64Encoded,
        'data.response?.bytesBase64Encoded': data.response?.bytesBase64Encoded,
        'data.predictions?.[0]?.bytesBase64Encoded': data.predictions?.[0]?.bytesBase64Encoded,
        'data.bytesBase64Encoded': data.bytesBase64Encoded,
        'data.response': data.response ? Object.keys(data.response) : null,
        'data.predictions': data.predictions ? 'exists' : null,
      }

      console.log('🔎 Video data checks:', checks)

      return NextResponse.json({
        done: data.done,
        structure: data,
        topLevelKeys: Object.keys(data),
        videoDataChecks: checks,
        hasVideoData: !!(
          data.response?.predictions?.[0]?.bytesBase64Encoded ||
          data.response?.bytesBase64Encoded ||
          data.predictions?.[0]?.bytesBase64Encoded ||
          data.bytesBase64Encoded
        )
      })
    } else {
      console.log('⏳ Operation still in progress')
      return NextResponse.json({
        done: false,
        message: 'Video generation still in progress',
        metadata: data.metadata
      })
    }
  } catch (error) {
    console.error("❌ Test endpoint error:", error)
    return NextResponse.json(
      { error: "Failed to test video status", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
