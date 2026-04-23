import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const createProductSchema = z.object({
  asin: z.string().optional(),
  title: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.any().optional(),
  originalImageUrl: z.string().url().optional()
})

// GET /api/products - List all products
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const category = searchParams.get("category")
    const search = searchParams.get("search")

    const where: any = {
      ...(user.organizationId ? { organizationId: user.organizationId } : {})
    }

    if (status) {
      where.status = status
    }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { asin: { contains: search, mode: "insensitive" } }
      ]
    }

    const products = await prisma.product.findMany({
      where,
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
            height: true
          },
          orderBy: {
            imageOrder: 'asc'
          }
        },
        images: {
          select: {
            id: true,
            imageTypeId: true,
            status: true,
            version: true
          }
        },
        _count: {
          select: {
            images: true,
            sourceImages: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })

    // Hide products that FBA sync marked as out-of-stock (explicit quantity === 0).
    // Products without any quantity metadata (e.g. newly imported from the catalog)
    // are shown — we have no signal either way.
    const visibleProducts = products.filter(product => {
      const metadata = product.metadata as any
      const quantity = metadata?.quantity ?? metadata?.inventory?.quantity
      if (quantity === undefined || quantity === null) return true
      return quantity > 0
    })

    return NextResponse.json(visibleProducts)
  } catch (error) {
    console.error("Error fetching products:", error)
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    )
  }
}

// POST /api/products - Create a new product
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = createProductSchema.parse(body)

    const product = await prisma.product.create({
      data: {
        ...validated,
        createdById: user.id,
        organizationId: user.organizationId
      },
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
        action: "CREATE_PRODUCT",
        entityType: "Product",
        entityId: product.id,
        metadata: {
          title: product.title,
          asin: product.asin
        }
      }
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating product:", error)
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    )
  }
}
