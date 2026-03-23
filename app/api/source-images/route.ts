import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const createSourceImageSchema = z.object({
  productId: z.string(),
  amazonImageUrl: z.string(),
  localFilePath: z.string(),
  variant: z.string(),
  width: z.number(),
  height: z.number(),
  imageOrder: z.number()
})

// POST /api/source-images - Create a source image
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    console.log("Creating source image with data:", body)

    const validated = createSourceImageSchema.parse(body)

    const sourceImage = await prisma.sourceImage.create({
      data: validated
    })

    console.log("Source image created successfully:", sourceImage.id)
    return NextResponse.json(sourceImage, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.issues)
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating source image:", error)
    console.error("Error details:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: "Failed to create source image", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
