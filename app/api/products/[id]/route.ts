import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const updateProductSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.any().optional(),
  originalImageUrl: z.string().url().optional()
})

// GET /api/products/[id] - Get a single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        sourceImages: {
          select: {
            id: true,
            amazonImageUrl: true,
            localFilePath: true,
            variant: true,
            width: true,
            height: true,
            imageOrder: true
          },
          orderBy: {
            imageOrder: 'asc'
          }
        },
        images: {
          select: {
            id: true,
            imageTypeId: true,
            templateId: true,
            templateName: true,
            status: true,
            version: true,
            fileName: true,
            filePath: true,
            width: true,
            height: true,
            createdAt: true,
            sourceImageId: true,
            parentImageId: true,
            // Amazon push tracking
            amazonSlot: true,
            amazonPushedAt: true,
            amazonPushStatus: true,
            imageType: {
              select: {
                id: true,
                name: true,
                description: true
              }
            },
            template: {
              select: {
                id: true,
                name: true
              }
            },
            sourceImage: {
              select: {
                id: true,
                variant: true,
                localFilePath: true
              }
            },
            parentImage: {
              select: {
                id: true,
                fileName: true,
                version: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        },
        promptOverrides: {
          include: {
            imageType: true
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (user.organizationId && product.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error("Error fetching product:", error)
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    )
  }
}

// PATCH /api/products/[id] - Update a product
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Verify org ownership before updating
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    if (user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const body = await request.json()
    const validated = updateProductSchema.parse(body)

    const product = await prisma.product.update({
      where: { id },
      data: validated,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_PRODUCT",
        entityType: "Product",
        entityId: product.id,
        metadata: validated
      }
    })

    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error updating product:", error)
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Delete a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Verify org ownership before deleting
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    if (user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    await prisma.product.delete({
      where: { id }
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "DELETE_PRODUCT",
        entityType: "Product",
        entityId: id
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    )
  }
}
