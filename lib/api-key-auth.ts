import crypto from "crypto"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/auth-helpers"

const KEY_PREFIX = "igp_"

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString("base64url")
  const plaintext = `${KEY_PREFIX}${raw}`
  const hash = hashApiKey(plaintext)
  const prefix = plaintext.slice(0, 12)
  return { plaintext, hash, prefix }
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex")
}

function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function authenticateApiKey(
  request: NextRequest | Request
): Promise<{ user: AuthUser; error?: never } | { user?: never; error: NextResponse }> {
  const token = extractBearerToken(request)
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Missing Authorization: Bearer <api-key> header" },
        { status: 401 }
      ),
    }
  }

  if (!token.startsWith(KEY_PREFIX)) {
    return {
      error: NextResponse.json({ error: "Invalid API key format" }, { status: 401 }),
    }
  }

  const hash = hashApiKey(token)
  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { user: true },
  })

  if (!record || record.revokedAt) {
    return {
      error: NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 }),
    }
  }

  // fire-and-forget lastUsedAt update
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    user: {
      id: record.user.id,
      email: record.user.email,
      name: record.user.name,
      role: record.user.role,
      organizationId: record.user.organizationId,
    },
  }
}
