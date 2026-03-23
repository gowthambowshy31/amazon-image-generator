import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { deleteFromS3, getS3KeyFromUrl } from "@/lib/s3"

// DELETE /api/images/[id] - Delete a generated image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Find the image
    const image = await prisma.generatedImage.findUnique({
      where: { id },
    })

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    // Delete from S3 if applicable
    if (image.filePath?.startsWith("https://") && image.filePath.includes(".s3.")) {
      const s3Key = getS3KeyFromUrl(image.filePath)
      if (s3Key) {
        await deleteFromS3(s3Key)
      }
    }

    // Delete the database record
    await prisma.generatedImage.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting image:", error)
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    )
  }
}
