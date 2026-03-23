import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// POST /api/templates/[id]/duplicate - Duplicate a template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { id } = await params

    const original = await prisma.promptTemplate.findUnique({
      where: { id },
      include: {
        variables: {
          orderBy: { order: "asc" }
        }
      }
    })

    if (!original) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      )
    }

    // Generate unique name
    let newName = `${original.name} (Copy)`
    let suffix = 1
    while (true) {
      const existing = await prisma.promptTemplate.findUnique({
        where: { name: newName }
      })
      if (!existing) break
      suffix++
      newName = `${original.name} (Copy ${suffix})`
    }

    // Create duplicate
    const duplicate = await prisma.promptTemplate.create({
      data: {
        name: newName,
        description: original.description,
        promptText: original.promptText,
        category: original.category,
        isActive: true,
        variables: {
          create: original.variables.map(v => ({
            name: v.name,
            displayName: v.displayName,
            type: v.type,
            isRequired: v.isRequired,
            defaultValue: v.defaultValue,
            options: v.options,
            autoFillSource: v.autoFillSource,
            order: v.order
          }))
        }
      },
      include: {
        variables: {
          orderBy: { order: "asc" }
        }
      }
    })

    return NextResponse.json(duplicate, { status: 201 })
  } catch (error) {
    console.error("Error duplicating template:", error)
    return NextResponse.json(
      { error: "Failed to duplicate template" },
      { status: 500 }
    )
  }
}
