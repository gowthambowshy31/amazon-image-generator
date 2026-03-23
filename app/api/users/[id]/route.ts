import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { z } from "zod"

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "EDITOR", "CLIENT", "VIEWER"]).optional(),
})

// PATCH /api/users/[id] - Update a user's role or name (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN")
  if (result.error) return result.error

  const { user } = result
  const { id } = await params

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated" },
      { status: 403 }
    )
  }

  // Ensure target user belongs to same org
  const targetUser = await prisma.user.findFirst({
    where: { id, organizationId: user.organizationId },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const validated = updateUserSchema.parse(body)

    const updated = await prisma.user.update({
      where: { id },
      data: validated,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error updating user:", error)
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id] - Remove a user from the organization (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN")
  if (result.error) return result.error

  const { user } = result
  const { id } = await params

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "No organization associated" },
      { status: 403 }
    )
  }

  // Can't delete yourself
  if (id === user.id) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    )
  }

  // Ensure target user belongs to same org
  const targetUser = await prisma.user.findFirst({
    where: { id, organizationId: user.organizationId },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  await prisma.user.delete({ where: { id } })

  return NextResponse.json({ message: "User deleted" })
}
