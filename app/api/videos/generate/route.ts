import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"
import path from "path"

const generateVideoSchema = z.object({
  productId: z.string(),
  videoTypeId: z.string().optional(),
  prompt: z.string().optional(),
  customPrompt: z.string().optional(),
  sourceImageId: z.string().optional(),
  generatedImageId: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().default("16:9"),
  durationSeconds: z.number().min(4).max(8).optional().default(4),
  resolution: z.enum(["720p", "1080p"]).optional().default("720p")
})

// POST /api/videos/generate - Generate a product video
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = generateVideoSchema.parse(body)

    // Get product
    const product = await prisma.product.findUnique({
      where: { id: validated.productId }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Determine the prompt to use
    let basePrompt = validated.prompt || ''

    // If videoTypeId is provided, get the template prompt
    if (validated.videoTypeId) {
      const videoType = await prisma.videoType.findUnique({
        where: { id: validated.videoTypeId }
      })

      if (!videoType) {
        return NextResponse.json({ error: "Video type not found" }, { status: 404 })
      }

      // Check for product-specific prompt override
      const promptOverride = await prisma.videoPromptOverride.findUnique({
        where: {
          productId_videoTypeId: {
            productId: validated.productId,
            videoTypeId: validated.videoTypeId
          }
        }
      })

      basePrompt = promptOverride?.customPrompt || videoType.defaultPrompt
    }

    // If customPrompt is provided, append it to the base prompt
    if (validated.customPrompt) {
      basePrompt = basePrompt
        ? `${basePrompt}\n\nAdditional instructions: ${validated.customPrompt}`
        : validated.customPrompt
    }

    if (!basePrompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 })
    }

    // Replace template variables in prompt
    const promptToUse = basePrompt
      .replace(/\{product_name\}/g, product.title)
      .replace(/\{product_title\}/g, product.title)
      .replace(/\{category\}/g, product.category || '')
      .replace(/\{asin\}/g, product.asin || '')

    // Create video generation request
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      )
    }

    console.log('🎬 Starting video generation with Veo 3.1...')
    console.log('Prompt:', promptToUse)
    console.log('Settings:', {
      aspectRatio: validated.aspectRatio,
      duration: validated.durationSeconds,
      resolution: validated.resolution
    })

    // Initiate video generation
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: promptToUse
            }
          ],
          parameters: {
            aspectRatio: validated.aspectRatio,
            durationSeconds: validated.durationSeconds,
            resolution: validated.resolution
          }
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Video generation API error:', errorData)
      return NextResponse.json(
        { error: "Video generation request failed", details: errorData },
        { status: 500 }
      )
    }

    const data = await response.json()
    const operationName = data.name

    if (!operationName) {
      return NextResponse.json(
        { error: "No operation name returned from API" },
        { status: 500 }
      )
    }

    console.log('✅ Video generation started:', operationName)

    // Create video record in database
    const videoRecord = await prisma.generatedVideo.create({
      data: {
        productId: validated.productId,
        videoTypeId: validated.videoTypeId,
        sourceImageId: validated.sourceImageId,
        generatedImageId: validated.generatedImageId,
        status: 'GENERATING',
        promptUsed: promptToUse,
        aiModel: 'veo-3.1',
        operationName,
        aspectRatio: validated.aspectRatio,
        durationSeconds: validated.durationSeconds,
        resolution: validated.resolution,
        generatedById: user.id
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "GENERATE_VIDEO",
        entityType: "GeneratedVideo",
        entityId: videoRecord.id,
        metadata: {
          productId: product.id,
          productTitle: product.title,
          operationName
        }
      }
    })

    return NextResponse.json({
      success: true,
      video: videoRecord,
      operationName,
      message: "Video generation started. Use the operation name to check status."
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error generating video:", error)
    return NextResponse.json(
      { error: "Failed to generate video" },
      { status: 500 }
    )
  }
}
