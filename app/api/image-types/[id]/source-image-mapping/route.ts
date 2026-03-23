import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

const mappingSchema = z.object({
  productId: z.string(),
  sourceImageId: z.string()
})

/**
 * POST /api/image-types/[id]/source-image-mapping
 * Create a mapping between image type and preferred source image for a product
 * This stores the user's selection in product metadata
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    const body = await request.json()
    const { productId, sourceImageId } = mappingSchema.parse(body)

    // Verify the source image exists and belongs to the product
    const sourceImage = await prisma.sourceImage.findFirst({
      where: {
        id: sourceImageId,
        productId: productId
      }
    })

    if (!sourceImage) {
      return NextResponse.json(
        { error: "Source image not found or doesn't belong to this product" },
        { status: 404 }
      )
    }

    // Verify the image type exists
    const imageType = await prisma.imageType.findUnique({
      where: { id }
    })

    if (!imageType) {
      return NextResponse.json(
        { error: "Image type not found" },
        { status: 404 }
      )
    }

    // Get the product and update its metadata with the mapping
    const product = await prisma.product.findUnique({
      where: { id: productId }
    })

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      )
    }

    // Update or create metadata with source image mappings
    const currentMetadata = (product.metadata as any) || {}
    const sourceImageMappings = currentMetadata.sourceImageMappings || {}
    sourceImageMappings[id] = sourceImageId

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        metadata: {
          ...currentMetadata,
          sourceImageMappings
        }
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "SET_SOURCE_IMAGE_MAPPING",
        entityType: "Product",
        entityId: productId,
        metadata: {
          imageTypeId: id,
          imageTypeName: imageType.name,
          sourceImageId,
          sourceImageVariant: sourceImage.variant
        }
      }
    })

    return NextResponse.json({
      success: true,
      mapping: {
        imageTypeId: id,
        sourceImageId,
        product: updatedProduct
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating source image mapping:", error)
    return NextResponse.json(
      { error: "Failed to create source image mapping" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/image-types/[id]/source-image-mapping?productId=xxx
 * Get the preferred source image for an image type and product
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      )
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        sourceImages: true
      }
    })

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      )
    }

    const metadata = (product.metadata as any) || {}
    const sourceImageMappings = metadata.sourceImageMappings || {}
    const mappedSourceImageId = sourceImageMappings[id]

    let sourceImage = null
    if (mappedSourceImageId) {
      sourceImage = product.sourceImages.find((img: { id: string }) => img.id === mappedSourceImageId)
    }

    return NextResponse.json({
      imageTypeId: id,
      sourceImageId: mappedSourceImageId || null,
      sourceImage: sourceImage || null,
      allSourceImages: product.sourceImages
    })
  } catch (error) {
    console.error("Error fetching source image mapping:", error)
    return NextResponse.json(
      { error: "Failed to fetch source image mapping" },
      { status: 500 }
    )
  }
}
