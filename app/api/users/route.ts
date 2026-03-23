import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole } from "@/lib/auth-helpers"
import bcrypt from "bcryptjs"
import { z } from "zod"

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "EDITOR", "CLIENT", "VIEWER"]).default("CLIENT"),
})

// GET /api/users - List users in the current organization
export async function GET() {
  const result = await requireAuth()
  if (result.error) return result.error

  const { user } = result

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated" },
      { status: 403 }
    )
  }

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(users)
}

// POST /api/users - Create a new user in the current organization (admin only)
export async function POST(request: NextRequest) {
  const result = await requireRole("ADMIN")
  if (result.error) return result.error

  const { user } = result

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated" },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const validated = createUserSchema.parse(body)

    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    })

    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12)

    const newUser = await prisma.user.create({
      data: {
        email: validated.email,
        name: validated.name,
        password: hashedPassword,
        role: validated.role,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json(newUser, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating user:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}
