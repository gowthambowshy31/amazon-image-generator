import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { z } from "zod"
import crypto from "crypto"

const createSchema = z.object({
  maxUses: z.number().int().min(1).default(1),
  grantsAdmin: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().optional(),
})

export async function GET() {
  const result = await requireRole("ADMIN")
  if (result.error) return result.error

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return NextResponse.json(codes)
}

export async function POST(request: NextRequest) {
  const result = await requireRole("ADMIN")
  if (result.error) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const code = crypto.randomBytes(8).toString("hex").toUpperCase()
    const created = await prisma.inviteCode.create({
      data: {
        code,
        maxUses: data.maxUses,
        grantsAdmin: data.grantsAdmin,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        notes: data.notes,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 })
    }
    console.error("Invite code create error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
