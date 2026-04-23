import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { generateApiKey } from "@/lib/api-key-auth"

export async function GET() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ keys })
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) return authResult.error
  const { user } = authResult

  const body = await request.json().catch(() => ({}))
  const name: string = (body?.name || "CLI Key").toString().slice(0, 80)

  const { plaintext, hash, prefix } = generateApiKey()

  const created = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name,
      keyHash: hash,
      keyPrefix: prefix,
    },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  })

  return NextResponse.json({
    ...created,
    key: plaintext,
    warning: "Save this key now — it will not be shown again.",
  })
}
