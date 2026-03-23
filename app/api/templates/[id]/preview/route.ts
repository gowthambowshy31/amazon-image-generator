import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"

const previewSchema = z.object({
  variables: z.record(z.string(), z.string().optional()),
  productId: z.string().optional()
})

// Helper to render template with variables
function renderTemplate(
  promptText: string,
  variableValues: Record<string, string | undefined>,
  product?: { title: string; category: string | null; asin: string | null }
): string {
  let rendered = promptText

  // Replace all {{variable}} placeholders
  const matches = promptText.matchAll(/\{\{(\w+)\}\}/g)
  for (const match of matches) {
    const varName = match[1]
    let value = variableValues[varName] || ""

    // Handle auto-fill from product
    if (!value && product) {
      if (varName === "product_title" || varName === "item_name") {
        value = product.title
      } else if (varName === "product_category" || varName === "category") {
        value = product.category || ""
      } else if (varName === "product_asin" || varName === "asin") {
        value = product.asin || ""
      }
    }

    rendered = rendered.replace(match[0], value)
  }

  return rendered
}

// POST /api/templates/[id]/preview - Preview rendered prompt
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
    const validated = previewSchema.parse(body)

    const template = await prisma.promptTemplate.findUnique({
      where: { id },
      include: {
        variables: {
          orderBy: { order: "asc" }
        }
      }
    })

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      )
    }

    // Fetch product if provided
    let product: { title: string; category: string | null; asin: string | null } | undefined
    if (validated.productId) {
      const productData = await prisma.product.findUnique({
        where: { id: validated.productId },
        select: { title: true, category: true, asin: true }
      })
      if (productData) {
        product = productData
      }
    }

    // Auto-fill values from product for AUTO type variables
    const finalVariables: Record<string, string | undefined> = { ...validated.variables }
    for (const variable of template.variables) {
      if (variable.type === "AUTO" && variable.autoFillSource && product) {
        const source = variable.autoFillSource
        if (source === "product.title") {
          finalVariables[variable.name] = product.title
        } else if (source === "product.category") {
          finalVariables[variable.name] = product.category || ""
        } else if (source === "product.asin") {
          finalVariables[variable.name] = product.asin || ""
        }
      }
    }

    const renderedPrompt = renderTemplate(template.promptText, finalVariables, product)

    // Check for missing required variables
    const missingVariables = template.variables
      .filter(v => v.isRequired && !finalVariables[v.name])
      .map(v => v.displayName)

    return NextResponse.json({
      renderedPrompt,
      missingVariables,
      variables: finalVariables
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error previewing template:", error)
    return NextResponse.json(
      { error: "Failed to preview template" },
      { status: 500 }
    )
  }
}
