import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  organizationName: z.string().min(1, "Organization name is required"),
  inviteCode: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = registerSchema.parse(body)

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    // Generate slug from org name
    const slug = validated.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    // Check if slug already exists, append random suffix if needed
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    })

    const finalSlug = existingOrg
      ? `${slug}-${Math.random().toString(36).substring(2, 7)}`
      : slug

    const hashedPassword = await bcrypt.hash(validated.password, 12)

    // Validate invite code if signup gating is enabled
    const requireInvite = process.env.REQUIRE_INVITE_CODE === "1"
    let inviteCode: any = null
    if (requireInvite || validated.inviteCode) {
      if (!validated.inviteCode) {
        return NextResponse.json({ error: "Invite code required" }, { status: 403 })
      }
      inviteCode = await prisma.inviteCode.findUnique({ where: { code: validated.inviteCode } })
      if (!inviteCode || !inviteCode.isActive) {
        return NextResponse.json({ error: "Invalid invite code" }, { status: 403 })
      }
      if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
        return NextResponse.json({ error: "Invite code expired" }, { status: 403 })
      }
      if (inviteCode.usedCount >= inviteCode.maxUses) {
        return NextResponse.json({ error: "Invite code already used" }, { status: 403 })
      }
    }

    // Create organization and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: validated.organizationName,
          slug: finalSlug,
        },
      })

      const user = await tx.user.create({
        data: {
          email: validated.email,
          name: validated.name,
          password: hashedPassword,
          role: inviteCode?.grantsAdmin ? "ADMIN" : "ADMIN", // first user is org admin
          organizationId: organization.id,
          inviteCodeId: inviteCode?.id,
        },
      })

      if (inviteCode) {
        await tx.inviteCode.update({
          where: { id: inviteCode.id },
          data: { usedCount: { increment: 1 } },
        })
      }

      return { organization, user }
    })

    return NextResponse.json(
      {
        message: "Account created successfully",
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    )
  }
}
