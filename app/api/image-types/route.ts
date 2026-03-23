import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const createImageTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().min(0).optional(),
  defaultPrompt: z.string().min(1)
})

// GET /api/image-types - List all image types
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const imageTypes = await prisma.imageType.findMany({
      orderBy: {
        order: 'asc'
      },
      include: {
        _count: {
          select: {
            images: true,
            promptVersions: true
          }
        }
      }
    })

    return NextResponse.json(imageTypes)
  } catch (error) {
    console.error("Error fetching image types:", error)
    return NextResponse.json(
      { error: "Failed to fetch image types" },
      { status: 500 }
    )
  }
}

// POST /api/image-types - Create a new image type
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = createImageTypeSchema.parse(body)

    const imageType = await prisma.imageType.create({
      data: validated
    })

    // Create initial prompt version
    await prisma.promptVersion.create({
      data: {
        imageTypeId: imageType.id,
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
        action: "CREATE_IMAGE_TYPE",
        entityType: "ImageType",
        entityId: imageType.id,
        metadata: {
          name: imageType.name
        }
      }
    })

    return NextResponse.json(imageType, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating image type:", error)
    return NextResponse.json(
      { error: "Failed to create image type" },
      { status: 500 }
    )
  }
}
