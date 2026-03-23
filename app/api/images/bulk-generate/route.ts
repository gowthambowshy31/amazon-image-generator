import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const bulkGenerateSchema = z.object({
  productIds: z.array(z.string()).min(1),
  imageTypeIds: z.array(z.string()).min(1),
  priority: z.number().min(0).max(10).optional()
})

// POST /api/images/bulk-generate - Queue bulk image generation
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = bulkGenerateSchema.parse(body)

    // Calculate total images to generate
    const totalImages = validated.productIds.length * validated.imageTypeIds.length

    // Create generation job
    const job = await prisma.generationJob.create({
      data: {
        productIds: validated.productIds,
        imageTypeIds: validated.imageTypeIds,
        status: 'QUEUED',
        priority: validated.priority || 0,
        totalImages
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_BULK_JOB",
        entityType: "GenerationJob",
        entityId: job.id,
        metadata: {
          productCount: validated.productIds.length,
          imageTypeCount: validated.imageTypeIds.length,
          totalImages
        }
      }
    })

    // In a real application, you would trigger a background worker here
    // For now, we'll just return the job
    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating bulk generation job:", error)
    return NextResponse.json(
      { error: "Failed to create bulk generation job" },
      { status: 500 }
    )
  }
}

// GET /api/images/bulk-generate - Get all generation jobs
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    const where: any = {}
    if (status) {
      where.status = status
    }

    const jobs = await prisma.generationJob.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error("Error fetching generation jobs:", error)
    return NextResponse.json(
      { error: "Failed to fetch generation jobs" },
      { status: 500 }
    )
  }
}
