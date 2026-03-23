import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const variableSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(["TEXT", "DROPDOWN", "AUTO"]),
  isRequired: z.boolean().default(true),
  defaultValue: z.string().optional().nullable(),
  options: z.array(z.string()).default([]),
  autoFillSource: z.string().optional().nullable(),
  order: z.number().int().min(0).default(0)
})

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  promptText: z.string().min(1),
  category: z.enum(["image", "video", "both"]).default("both"),
  order: z.number().int().min(0).default(0),
  variables: z.array(variableSchema).default([])
})

// GET /api/templates - List all templates
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const includeInactive = searchParams.get("includeInactive") === "true"

    const templates = await prisma.promptTemplate.findMany({
      where: {
        ...(category && category !== "all"
          ? { OR: [{ category }, { category: "both" }] }
          : {}),
        ...(!includeInactive ? { isActive: true } : {})
      },
      include: {
        variables: {
          orderBy: { order: "asc" }
        },
        _count: {
          select: { usageHistory: true }
        }
      },
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }]
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error("Error fetching templates:", error)
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    )
  }
}

// POST /api/templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = createTemplateSchema.parse(body)

    const template = await prisma.promptTemplate.create({
      data: {
        name: validated.name,
        description: validated.description,
        promptText: validated.promptText,
        category: validated.category,
        order: validated.order,
        variables: {
          create: validated.variables.map((v, index) => ({
            name: v.name,
            displayName: v.displayName,
            type: v.type,
            isRequired: v.isRequired,
            defaultValue: v.defaultValue,
            options: v.options,
            autoFillSource: v.autoFillSource,
            order: v.order ?? index
          }))
        }
      },
      include: {
        variables: {
          orderBy: { order: "asc" }
        }
      }
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    if ((error as any)?.code === "P2002") {
      return NextResponse.json(
        { error: "A template with this name already exists" },
        { status: 409 }
      )
    }

    console.error("Error creating template:", error)
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    )
  }
}
