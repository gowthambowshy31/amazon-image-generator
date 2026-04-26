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
  // Optional fresh close-up reference (base64 data URL); falls back to original-only generation if absent
  referenceImageBase64: z.string().optional(),
})

async function downloadImageToTemp(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const tempPath = path.join(os.tmpdir(), `regen-src-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
  } catch {
    return null
  }
}

async function writeBase64ToTemp(dataUrl: string): Promise<string | null> {
  try {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
    if (!m) return null
    const buffer = Buffer.from(m[2], 'base64')
    const ext = m[1].includes('png') ? 'png' : m[1].includes('webp') ? 'webp' : 'jpg'
    const tempPath = path.join(os.tmpdir(), `regen-ref-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
  } catch {
    return null
  }
}

// POST /api/images/[id]/regenerate - Re-run the original generation with the same source image and prompt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { referenceImageBase64 } = schema.parse(body)

    const original = await prisma.generatedImage.findUnique({
      where: { id },
      include: { product: true, sourceImage: true },
    })
    if (!original) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    // Resolve the original variant source image (the zoomed-out / Amazon image)
    let primaryTemp: string | null = null
    let primaryPath: string | undefined
    const src = original.sourceImage
    if (src?.localFilePath?.startsWith("http")) {
      primaryTemp = await downloadImageToTemp(src.localFilePath)
      primaryPath = primaryTemp || undefined
    } else if (src?.localFilePath) {
      primaryPath = path.join(process.cwd(), "public", src.localFilePath)
    } else if (src?.amazonImageUrl) {
      primaryTemp = await downloadImageToTemp(src.amazonImageUrl)
      primaryPath = primaryTemp || undefined
    }

    // Optional close-up reference
    let refTemp: string | null = null
    const additionalSourceImagePaths: string[] = []
    let promptToUse = original.promptUsed
    if (referenceImageBase64) {
      refTemp = await writeBase64ToTemp(referenceImageBase64)
      if (refTemp) {
        additionalSourceImagePaths.push(refTemp)
        promptToUse = `${promptToUse}\n\nReference: The second image is a close-up of the same product. Use it as the source of truth for fine detail, structure, and proportions. Preserve every detail visible in the close-up; do not invent or alter the design.`
      }
    }

    // Determine next version
    const versionWhere: any = { productId: original.productId }
    if (original.templateId) versionWhere.templateId = original.templateId
    else if (original.imageTypeId) versionWhere.imageTypeId = original.imageTypeId
    const latest = await prisma.generatedImage.findFirst({
      where: versionWhere,
      orderBy: { version: "desc" },
    })
    const nextVersion = (latest?.version || original.version) + 1

    // Build filename
    const productIdentifier = original.product.asin || original.productId.slice(0, 8)
    const baseName = (original.templateName || "regen").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()
    const seq = String(Date.now()).slice(-4)
    const fileName = `${productIdentifier}_${baseName}_regen_v${nextVersion}_${seq}.png`
    const uploadDir = process.env.UPLOAD_DIR || "./public/uploads"
    const outputPath = path.join(process.cwd(), uploadDir, fileName)

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
        promptUsed: promptToUse,
        aiModel: "gemini",
        generationParams: {
          regeneratedFromImageId: original.id,
          hadReferenceImage: !!refTemp,
        },
        generatedById: user.id,
      },
    })

    const result = await generateImage({
      prompt: promptToUse,
      sourceImagePath: primaryPath,
      additionalSourceImagePaths,
      outputPath,
    })

    if (primaryTemp) {
      try { await fs.unlink(primaryTemp) } catch {}
    }
    if (refTemp) {
      try { await fs.unlink(refTemp) } catch {}
    }

    if (!result.success) {
      await prisma.generatedImage.update({
        where: { id: newRecord.id },
        data: { status: "REJECTED" },
      })
      return NextResponse.json({ error: result.error || "Generation failed" }, { status: 500 })
    }

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
    console.error("Error regenerating image:", error)
    return NextResponse.json({ error: "Failed to regenerate image" }, { status: 500 })
  }
}
