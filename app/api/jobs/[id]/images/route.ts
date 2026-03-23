import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/jobs/[id]/images - Get generated images for a specific job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Verify job exists
    const job = await prisma.generationJob.findUnique({
      where: { id }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Query generated images where generationParams contains this job's ID
    const images = await prisma.generatedImage.findMany({
      where: {
        generationParams: {
          path: ["bulkJobId"],
          equals: id
        }
      },
      include: {
        product: {
          select: { id: true, title: true, asin: true }
        },
        imageType: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: "asc" }
    })

    return NextResponse.json({ images })
  } catch (error) {
    console.error("Error fetching job images:", error)
    return NextResponse.json(
      { error: "Failed to fetch job images" },
      { status: 500 }
    )
  }
}
