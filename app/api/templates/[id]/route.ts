import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const variableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(["TEXT", "DROPDOWN", "AUTO"]),
  isRequired: z.boolean().default(true),
  defaultValue: z.string().optional().nullable(),
  options: z.array(z.string()).default([]),
  autoFillSource: z.string().optional().nullable(),
  order: z.number().int().min(0).default(0)
})

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  promptText: z.string().min(1).optional(),
  category: z.enum(["image", "video", "both"]).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  variables: z.array(variableSchema).optional()
})

// GET /api/templates/[id] - Get single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    const template = await prisma.promptTemplate.findUnique({
      where: { id },
      include: {
        variables: {
          orderBy: { order: "asc" }
        },
        _count: {
          select: { usageHistory: true }
        }
      }
    })

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error("Error fetching template:", error)
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    )
  }
}

// PUT /api/templates/[id] - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params
    const body = await request.json()
    const validated = updateTemplateSchema.parse(body)

    // Check if template exists
    const existing = await prisma.promptTemplate.findUnique({
      where: { id },
      include: { variables: true }
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      )
    }

    // Update template and handle variables
    const updateData: any = {}
    if (validated.name !== undefined) updateData.name = validated.name
    if (validated.description !== undefined) updateData.description = validated.description
    if (validated.promptText !== undefined) updateData.promptText = validated.promptText
    if (validated.category !== undefined) updateData.category = validated.category
    if (validated.order !== undefined) updateData.order = validated.order
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive

    // If variables are provided, replace all existing ones
    if (validated.variables !== undefined) {
      // Delete all existing variables
      await prisma.templateVariable.deleteMany({
        where: { templateId: id }
      })

      // Create new variables
      updateData.variables = {
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
    }

    const template = await prisma.promptTemplate.update({
      where: { id },
      data: updateData,
      include: {
        variables: {
          orderBy: { order: "asc" }
        }
      }
    })

    return NextResponse.json(template)
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

    console.error("Error updating template:", error)
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    )
  }
}

// DELETE /api/templates/[id] - Soft delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    // Soft delete by setting isActive to false
    const template = await prisma.promptTemplate.update({
      where: { id },
      data: { isActive: false }
    })

    return NextResponse.json({ success: true, template })
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      )
    }

    console.error("Error deleting template:", error)
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    )
  }
}
