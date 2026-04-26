import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const upsertSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  devId: z.string().optional(),
  redirectUri: z.string().url(),
})

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const conn = await prisma.ebayConnection.findFirst({
    where: { organizationId: result.organizationId, isActive: true },
    select: {
      id: true,
      environment: true,
      isActive: true,
      redirectUri: true,
      clientId: true,
      devId: true,
      tokenExpiresAt: true,
      refreshToken: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!conn) return NextResponse.json({ connected: false })
  return NextResponse.json({
    connected: true,
    id: conn.id,
    environment: conn.environment,
    redirectUri: conn.redirectUri,
    hasRefreshToken: !!conn.refreshToken,
    tokenExpiresAt: conn.tokenExpiresAt,
  })
}

export async function PUT(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const body = await req.json()
  const data = upsertSchema.parse(body)
  const existing = await prisma.ebayConnection.findFirst({
    where: { organizationId: result.organizationId, name: "default" },
  })
  if (existing) {
    const updated = await prisma.ebayConnection.update({
      where: { id: existing.id },
      data: {
        environment: data.environment,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        devId: data.devId,
        redirectUri: data.redirectUri,
      },
    })
    return NextResponse.json(updated)
  }
  const created = await prisma.ebayConnection.create({
    data: {
      organizationId: result.organizationId,
      name: "default",
      environment: data.environment,
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      devId: data.devId,
      redirectUri: data.redirectUri,
    },
  })
  return NextResponse.json(created)
}

export async function DELETE() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  await prisma.ebayConnection.updateMany({
    where: { organizationId: result.organizationId },
    data: { refreshToken: null, accessToken: null, tokenExpiresAt: null },
  })
  return NextResponse.json({ ok: true })
}
