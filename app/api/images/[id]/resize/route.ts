import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { generateImage } from "@/lib/gemini"
import { uploadToS3 } from "@/lib/s3"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { z } from "zod"

const schema = z.object({
  direction: z.enum(["smaller", "bigger"]),
})

async function downloadImageToTemp(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const tempPath = path.join(os.tmpdir(), `resize-src-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
  } catch {
    return null
  }
}

async function resolveImagePath(filePath: string): Promise<{ tempPath: string | null; localPath: string | undefined }> {
  if (!filePath) return { tempPath: null, localPath: undefined }
  if (filePath.startsWith("http")) {
    const tempPath = await downloadImageToTemp(filePath)
    return { tempPath, localPath: tempPath || undefined }
  }
  // Absolute local path from prior generations
  return { tempPath: null, localPath: filePath }
}

// POST /api/images/[id]/resize - Generate a new version with the product scaled smaller or bigger
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params
    const body = await request.json()
    const { direction } = schema.parse(body)

    const original = await prisma.generatedImage.findUnique({
      where: { id },
      include: { product: true },
    })
    if (!original) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    // Pull the previous image down to use as the sole source
    const { tempPath, localPath } = await resolveImagePath(original.filePath)
    if (!localPath) {
      return NextResponse.json({ error: "Could not load original image" }, { status: 500 })
    }

    const directionLabel = direction === "smaller" ? "smaller" : "bigger"
    const prompt = `Take the product shown in this image and re-render it with the product scaled ~15% ${directionLabel} within the frame. Keep the background, framing, lighting, angle, color, and every fine detail of the product itself identical. Do not change the design of the product. Output a clean professional product photograph.`

    // Determine next version
    const versionWhere: any = { productId: original.productId }
    if (original.templateId) versionWhere.templateId = original.templateId
    else if (original.imageTypeId) versionWhere.imageTypeId = original.imageTypeId
    const latest = await prisma.generatedImage.findFirst({
      where: versionWhere,
      orderBy: { version: "desc" },
    })
    const nextVersion = (latest?.version || original.version) + 1

    // Build output filename
    const tag = direction === "smaller" ? "smaller" : "bigger"
    const productIdentifier = original.product.asin || original.productId.slice(0, 8)
    const baseName = (original.templateName || "resize").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()
    const seq = String(Date.now()).slice(-4)
    const fileName = `${productIdentifier}_${baseName}_${tag}_v${nextVersion}_${seq}.png`
    const uploadDir = process.env.UPLOAD_DIR || "./public/uploads"
    const outputPath = path.join(process.cwd(), uploadDir, fileName)

    // Create pending row
    const newRecord = await prisma.generatedImage.create({
      data: {
        productId: original.productId,
        imageTypeId: original.imageTypeId,
        templateId: original.templateId,
        templateName: original.templateName,
        sourceImageId: original.sourceImageId,
        parentImageId: original.id,
        version: nextVersion,
        status: "GENERATING",
        filePath: outputPath,
        fileName,
        promptUsed: prompt,
        aiModel: "gemini",
        generationParams: {
          resizedFromImageId: original.id,
          direction,
        },
        generatedById: user.id,
      },
    })

    // Generate
    const result = await generateImage({ prompt, sourceImagePath: localPath, outputPath })

    // Cleanup temp source
    if (tempPath) {
      try { await fs.unlink(tempPath) } catch {}
    }

    if (!result.success) {
      await prisma.generatedImage.update({
        where: { id: newRecord.id },
        data: { status: "REJECTED" },
      })
      return NextResponse.json({ error: result.error || "Generation failed" }, { status: 500 })
    }

    // Upload to S3
    const buffer = await fs.readFile(outputPath)
    const s3Key = `generated-images/${original.productId}/${fileName}`
    const s3Result = await uploadToS3({ buffer, key: s3Key, contentType: "image/png" })

    try { await fs.unlink(outputPath) } catch {}

    if (!s3Result.success || !s3Result.url) {
      await prisma.generatedImage.update({
        where: { id: newRecord.id },
        data: { status: "REJECTED" },
      })
      return NextResponse.json({ error: `S3 upload failed: ${s3Result.error}` }, { status: 500 })
    }

    const updated = await prisma.generatedImage.update({
      where: { id: newRecord.id },
      data: {
        status: "COMPLETED",
        filePath: s3Result.url,
        width: result.width,
        height: result.height,
        fileSize: result.fileSize,
      },
      include: {
        product: { select: { id: true, title: true, asin: true } },
        template: { select: { id: true, name: true } },
        imageType: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      id: updated.id,
      filePath: updated.filePath,
      fileName: updated.fileName,
      status: updated.status,
      version: updated.version,
      product: updated.product,
      imageType: updated.imageType,
      template: updated.template,
      templateName: updated.templateName,
      createdAt: updated.createdAt,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("Error resizing image:", error)
    return NextResponse.json({ error: "Failed to resize image" }, { status: 500 })
  }
}
