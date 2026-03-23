import { NextRequest, NextResponse } from "next/server"
import { uploadToS3 } from "@/lib/s3"
import { requireAuth } from "@/lib/auth-helpers"

/**
 * POST /api/amazon/upload-external-image
 * Upload an external image file to S3 for pushing to Amazon.
 * Accepts multipart form data with an image file.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/tiff", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, TIFF, GIF, WebP` },
        { status: 400 }
      )
    }

    // Validate file size (10MB max per Amazon requirements)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB` },
        { status: 400 }
      )
    }

    // Read file into buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generate S3 key
    const timestamp = Date.now()
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase()
    const key = `external-uploads/${timestamp}-${sanitizedName}`

    // Upload to S3
    const result = await uploadToS3({
      buffer,
      key,
      contentType: file.type,
    })

    if (!result.success || !result.url) {
      return NextResponse.json(
        { error: `S3 upload failed: ${result.error}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      publicUrl: result.url,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    })
  } catch (error) {
    console.error("Error uploading external image:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
