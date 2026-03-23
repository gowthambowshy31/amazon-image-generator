import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const createVideoTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().min(0).optional(),
  defaultPrompt: z.string().min(1)
})

// GET /api/video-types - List all video types
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const videoTypes = await prisma.videoType.findMany({
      orderBy: {
        order: 'asc'
      },
      include: {
        _count: {
          select: {
            videos: true,
            promptVersions: true
          }
        }
      }
    })

    return NextResponse.json(videoTypes)
  } catch (error) {
    console.error("Error fetching video types:", error)
    return NextResponse.json(
      { error: "Failed to fetch video types" },
      { status: 500 }
    )
  }
}

// POST /api/video-types - Create a new video type
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = createVideoTypeSchema.parse(body)

    const videoType = await prisma.videoType.create({
      data: validated
    })

    // Create initial prompt version
    await prisma.videoPromptVersion.create({
      data: {
        videoTypeId: videoType.id,
        promptText: validated.defaultPrompt,
        version: 1,
        isActive: true,
        changeNote: "Initial version"
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_VIDEO_TYPE",
        entityType: "VideoType",
        entityId: videoType.id,
        metadata: {
          name: videoType.name
        }
      }
    })

    return NextResponse.json(videoType, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating video type:", error)
    return NextResponse.json(
      { error: "Failed to create video type" },
      { status: 500 }
    )
  }
}
