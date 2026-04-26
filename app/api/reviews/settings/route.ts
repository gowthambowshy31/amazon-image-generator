import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  sendAfterDays: z.number().int().min(5).max(30),
  autoSolicitEnabled: z.boolean(),
})

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const settings = await prisma.reviewSettings.findUnique({
    where: { organizationId: result.organizationId },
  })
  return NextResponse.json(settings ?? { sendAfterDays: 5, autoSolicitEnabled: true })
}

export async function PUT(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  try {
    const body = await req.json()
    const data = schema.parse(body)
    const updated = await prisma.reviewSettings.upsert({
      where: { organizationId: result.organizationId },
      create: { organizationId: result.organizationId, ...data },
      update: data,
    })
    return NextResponse.json(updated)
  } catch (error: any) {
    if (error.name === "ZodError")
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
