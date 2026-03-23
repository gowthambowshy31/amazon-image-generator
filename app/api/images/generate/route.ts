import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { generateImage } from "@/lib/gemini"
import { uploadToS3 } from "@/lib/s3"
import { z } from "zod"
import path from "path"
import fs from "fs/promises"
import os from "os"

// Helper function to download image from URL to temp file
async function downloadImageToTemp(url: string): Promise<string | null> {
  try {
    console.log('📥 Downloading image from URL:', url)
    const response = await fetch(url)
    if (!response.ok) {
      console.error('❌ Failed to download image:', response.statusText)
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const tempPath = path.join(os.tmpdir(), `source-${Date.now()}.jpg`)
    await fs.writeFile(tempPath, buffer)
    console.log('✅ Image downloaded to temp:', tempPath)
    return tempPath
  } catch (error) {
    console.error('❌ Error downloading image:', error)
    return null
  }
}

const generateImageSchema = z.object({
  productId: z.string(),
  imageTypeId: z.string().optional(),
  templateId: z.string().optional(),
  renderedPrompt: z.string().optional(),
  sourceImageId: z.string().optional(),
  generatedImageId: z.string().optional(),
  customPrompt: z.string().optional(),
  parentImageId: z.string().optional()
}).refine(
  data => data.imageTypeId || data.templateId || data.renderedPrompt || data.customPrompt,
  { message: "Must provide imageTypeId, templateId, renderedPrompt, or customPrompt" }
)

// POST /api/images/generate - Generate a single image
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = generateImageSchema.parse(body)

    // Get product with source images
    const product = await prisma.product.findUnique({
      where: { id: validated.productId },
      include: {
        sourceImages: true
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Resolve prompt source: template flow vs legacy imageType flow
    let imageType: any = null
    let template: any = null
    let displayName = 'Generated Image'
    let promptToUse = ''

    if (validated.templateId) {
      // New template flow
      template = await prisma.promptTemplate.findUnique({
        where: { id: validated.templateId },
        include: { variables: true }
      })

      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }

      displayName = template.name
      // Use rendered prompt from frontend, or customPrompt, or template's raw promptText
      promptToUse = validated.renderedPrompt || validated.customPrompt || template.promptText
    } else if (validated.imageTypeId) {
      // Legacy imageType flow
      imageType = await prisma.imageType.findUnique({
        where: { id: validated.imageTypeId }
      })

      if (!imageType) {
        return NextResponse.json({ error: "Image type not found" }, { status: 404 })
      }

      displayName = imageType.name
      promptToUse = validated.customPrompt || imageType.defaultPrompt

      // Check if there's a product-specific override
      if (!validated.customPrompt) {
        const override = await prisma.promptOverride.findUnique({
          where: {
            productId_imageTypeId: {
              productId: validated.productId,
              imageTypeId: validated.imageTypeId
            }
          }
        })

        if (override) {
          promptToUse = override.customPrompt
        }
      }
    } else {
      // Fallback: just customPrompt or renderedPrompt
      promptToUse = validated.renderedPrompt || validated.customPrompt || ''
      displayName = 'Custom'
    }

    // Replace template variables in prompt (both single and double brace syntax)
    promptToUse = promptToUse
      .replace(/\{\{product_name\}\}/g, product.title)
      .replace(/\{\{product_title\}\}/g, product.title)
      .replace(/\{\{category\}\}/g, product.category || '')
      .replace(/\{\{asin\}\}/g, product.asin || '')
      .replace(/\{product_name\}/g, product.title)
      .replace(/\{product_title\}/g, product.title)
      .replace(/\{category\}/g, product.category || '')
      .replace(/\{asin\}/g, product.asin || '')

    // Get version number
    const versionWhere: any = { productId: validated.productId }
    if (validated.templateId) {
      versionWhere.templateId = validated.templateId
    } else if (validated.imageTypeId) {
      versionWhere.imageTypeId = validated.imageTypeId
    }

    const existingImages = await prisma.generatedImage.findMany({
      where: versionWhere,
      orderBy: {
        version: 'desc'
      },
      take: 1
    })

    const version = existingImages.length > 0 ? existingImages[0].version + 1 : 1

    // Determine source image path
    let sourceImagePath: string | undefined
    let sourceImageId: string | undefined
    let tempFilePath: string | null = null // Track temp file for cleanup

    if (validated.sourceImageId) {
      // Use the selected source image from Amazon
      const sourceImage = await prisma.sourceImage.findUnique({
        where: { id: validated.sourceImageId }
      })

      if (sourceImage) {
        sourceImageId = sourceImage.id
        if (sourceImage.localFilePath) {
          // Use S3 or local file
          if (sourceImage.localFilePath.startsWith('http')) {
            // S3 URL - download to temp
            tempFilePath = await downloadImageToTemp(sourceImage.localFilePath)
            sourceImagePath = tempFilePath || undefined
          } else {
            sourceImagePath = path.join(process.cwd(), 'public', sourceImage.localFilePath)
          }
        } else if (sourceImage.amazonImageUrl) {
          // No local file, download from Amazon URL
          tempFilePath = await downloadImageToTemp(sourceImage.amazonImageUrl)
          sourceImagePath = tempFilePath || undefined
        }
      }
    } else if (validated.generatedImageId) {
      // Use a previously generated image as source
      const generatedImage = await prisma.generatedImage.findUnique({
        where: { id: validated.generatedImageId }
      })
      if (generatedImage) {
        // If filePath is a URL (S3), download it to temp
        if (generatedImage.filePath?.startsWith('http')) {
          tempFilePath = await downloadImageToTemp(generatedImage.filePath)
          sourceImagePath = tempFilePath || undefined
        } else {
          sourceImagePath = path.join(process.cwd(), 'public', generatedImage.filePath)
        }
        // Keep the original source image ID if available
        sourceImageId = generatedImage.sourceImageId || undefined
      }
    } else if (validated.parentImageId) {
      // Use parent generated image for iteration
      const parentImage = await prisma.generatedImage.findUnique({
        where: { id: validated.parentImageId }
      })
      if (parentImage) {
        // If filePath is a URL (S3), download it to temp
        if (parentImage.filePath?.startsWith('http')) {
          tempFilePath = await downloadImageToTemp(parentImage.filePath)
          sourceImagePath = tempFilePath || undefined
        } else {
          sourceImagePath = path.join(process.cwd(), 'public', parentImage.filePath)
        }
        sourceImageId = parentImage.sourceImageId || undefined
      }
    } else if (product.sourceImages.length > 0) {
      // Default to first source image if available
      const firstSourceImage = product.sourceImages[0]
      sourceImageId = firstSourceImage.id
      if (firstSourceImage.localFilePath) {
        // Use S3 or local file
        if (firstSourceImage.localFilePath.startsWith('http')) {
          // S3 URL - download to temp
          tempFilePath = await downloadImageToTemp(firstSourceImage.localFilePath)
          sourceImagePath = tempFilePath || undefined
        } else {
          sourceImagePath = path.join(process.cwd(), 'public', firstSourceImage.localFilePath)
        }
      } else if (firstSourceImage.amazonImageUrl) {
        // No local file, download from Amazon URL
        tempFilePath = await downloadImageToTemp(firstSourceImage.amazonImageUrl)
        sourceImagePath = tempFilePath || undefined
      }
    }

    // Generate meaningful filename: ASIN_TemplateName_v1_001.png
    // Sanitize display name for filename (remove special chars, replace spaces with hyphens)
    const sanitizedImageTypeName = displayName
      .replace(/[^a-zA-Z0-9\s-]/g, '')  // Remove special characters
      .replace(/\s+/g, '-')              // Replace spaces with hyphens
      .toLowerCase()

    // Use ASIN if available, otherwise fall back to a shortened product ID
    const productIdentifier = product.asin || product.id.slice(0, 8)

    // Create a sequential number based on timestamp for uniqueness
    const sequenceNum = String(Date.now()).slice(-4)

    const fileName = `${productIdentifier}_${sanitizedImageTypeName}_v${version}_${sequenceNum}.png`
    const uploadDir = process.env.UPLOAD_DIR || './public/uploads'
    const outputPath = path.join(process.cwd(), uploadDir, fileName)

    // Update product status to IN_PROGRESS if not already
    if (product.status === 'NOT_STARTED') {
      await prisma.product.update({
        where: { id: product.id },
        data: { status: 'IN_PROGRESS' }
      })
    }

    // Create pending image record
    const imageRecord = await prisma.generatedImage.create({
      data: {
        productId: validated.productId,
        imageTypeId: validated.imageTypeId || null,
        templateId: validated.templateId || null,
        templateName: template?.name || imageType?.name || displayName,
        sourceImageId,
        version,
        status: 'GENERATING',
        filePath: outputPath,
        fileName,
        promptUsed: promptToUse,
        aiModel: 'gemini',
        generationParams: {
          sourceImageId: sourceImageId,
          hasParent: !!validated.parentImageId,
          usedGeneratedImage: !!validated.generatedImageId
        },
        parentImageId: validated.parentImageId,
        generatedById: user.id
      }
    })

    // ============ DETAILED LOGGING FOR GEMINI API CALL ============
    console.log('\n========================================')
    console.log('🎨 GENERATING IMAGE WITH GEMINI API')
    console.log('========================================')
    console.log('📦 Product:', {
      id: product.id,
      title: product.title,
      category: product.category,
      asin: product.asin
    })
    console.log('🖼️  Template/Type:', {
      id: template?.id || imageType?.id,
      name: displayName,
      source: template ? 'PromptTemplate' : imageType ? 'ImageType' : 'Custom'
    })
    console.log('📝 Prompt being sent to Gemini:')
    console.log('---')
    console.log(promptToUse)
    console.log('---')
    console.log('🖼️  Source Image Path:', sourceImagePath || 'No source image (text-to-image)')
    if (sourceImageId) {
      console.log('📎 Source Image ID:', sourceImageId)
    }
    if (validated.parentImageId) {
      console.log('🔄 Parent Image ID (regeneration):', validated.parentImageId)
    }
    console.log('💾 Output Path:', outputPath)
    console.log('📊 Version:', version)
    console.log('========================================\n')
    // ============================================================

    // Generate the image
    const result = await generateImage({
      prompt: promptToUse,
      sourceImagePath,
      outputPath
    })

    // ============ LOGGING GEMINI API RESULT ============
    console.log('\n========================================')
    console.log('✅ GEMINI API RESPONSE')
    console.log('========================================')
    if (!result.success) {
      console.log('❌ Status: FAILED')
      console.log('🚫 Error:', result.error)
    } else {
      console.log('✅ Status: SUCCESS')
      console.log('📐 Dimensions:', `${result.width}x${result.height}`)
      console.log('📦 File Size:', result.fileSize ? `${(result.fileSize / 1024).toFixed(2)} KB` : 'Unknown')
      console.log('💾 Saved to:', outputPath)
    }
    console.log('========================================\n')
    // ===================================================

    if (!result.success) {
      // Update image record with error
      await prisma.generatedImage.update({
        where: { id: imageRecord.id },
        data: {
          status: 'REJECTED'
        }
      })

      return NextResponse.json(
        { error: result.error || "Image generation failed" },
        { status: 500 }
      )
    }

    // Upload generated image to S3 (mandatory - we don't keep local files)
    let finalFilePath: string
    const imageBuffer = await fs.readFile(outputPath)
    const s3Key = `generated-images/${product.id}/${fileName}`
    const s3Result = await uploadToS3({
      buffer: imageBuffer,
      key: s3Key,
      contentType: 'image/png'
    })

    if (s3Result.success && s3Result.url) {
      finalFilePath = s3Result.url
      console.log('☁️  Uploaded generated image to S3:', s3Result.url)

      // Delete local file after successful S3 upload
      try {
        await fs.unlink(outputPath)
        console.log('🧹 Deleted local file after S3 upload')
      } catch (e) {
        // Ignore cleanup errors
      }
    } else {
      // S3 upload failed - this is now a hard error
      console.error('❌ S3 upload failed:', s3Result.error)

      // Clean up local file
      try {
        await fs.unlink(outputPath)
      } catch (e) {
        // Ignore cleanup errors
      }

      // Mark image as failed
      await prisma.generatedImage.update({
        where: { id: imageRecord.id },
        data: { status: 'REJECTED' }
      })

      return NextResponse.json(
        { error: `S3 upload failed: ${s3Result.error}` },
        { status: 500 }
      )
    }

    // Update image record with results
    const updatedImage = await prisma.generatedImage.update({
      where: { id: imageRecord.id },
      data: {
        status: 'COMPLETED',
        filePath: finalFilePath,
        width: result.width,
        height: result.height,
        fileSize: result.fileSize
      },
      include: {
        imageType: true,
        template: true,
        product: true
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "GENERATE_IMAGE",
        entityType: "GeneratedImage",
        entityId: updatedImage.id,
        metadata: {
          productId: product.id,
          productTitle: product.title,
          imageType: displayName,
          templateId: template?.id || null,
          version
        }
      }
    })

    // Update analytics
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find existing analytics record for today
    const existingAnalytics = await prisma.analytics.findFirst({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      }
    })

    if (existingAnalytics) {
      // Update existing record
      await prisma.analytics.update({
        where: { id: existingAnalytics.id },
        data: {
          imagesGenerated: { increment: 1 }
        }
      })
    } else {
      // Create new record
      await prisma.analytics.create({
        data: {
          date: today,
          imagesGenerated: 1
        }
      })
    }

    // Cleanup temp file if created
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath)
        console.log('🧹 Cleaned up temp file:', tempFilePath)
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(updatedImage, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error generating image:", error)
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    )
  }
}
