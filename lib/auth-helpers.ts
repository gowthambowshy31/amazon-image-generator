import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  organizationId: string | null
}

/**
 * Get the authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
    role: session.user.role,
    organizationId: session.user.organizationId,
  }
}

/**
 * Require authentication. Returns the user or a 401 response.
 */
export async function requireAuth(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    }
  }
  return { user }
}

/**
 * Require a specific role. Returns the user or a 403 response.
 */
export async function requireRole(
  ...roles: string[]
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth()
  if (result.error) return result

  if (!roles.includes(result.user.role)) {
    return {
      error: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      ),
    }
  }
  return { user: result.user }
}

/**
 * Get the organization ID for the authenticated user.
 * Returns the orgId or an error response.
 */
export async function requireOrgAccess(): Promise<
  { user: AuthUser; organizationId: string; error?: never } | { user?: never; organizationId?: never; error: NextResponse }
> {
  const result = await requireAuth()
  if (result.error) return { error: result.error }

  if (!result.user.organizationId) {
    return {
      error: NextResponse.json(
        { error: "No organization associated with this account" },
        { status: 403 }
      ),
    }
  }

  return { user: result.user, organizationId: result.user.organizationId }
}

/**
 * Build a Prisma where clause scoped to the user's organization.
 * Admin users (SUPER_ADMIN) can optionally bypass org scoping.
 */
export function orgWhere(organizationId: string | null, additionalWhere: Record<string, any> = {}) {
  if (!organizationId) return additionalWhere
  return { ...additionalWhere, organizationId }
}
