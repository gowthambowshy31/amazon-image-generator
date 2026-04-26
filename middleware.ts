import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

const cookieName = "image-gen-platform.session-token"
const publicRoutes = [
  "/login",
  "/register",
  "/api/auth",
  "/gallery",
  "/api/batch",
  "/api/cli",
  "/api/cron",      // cron endpoints authenticate via x-cron-secret / ?secret= param
  "/api/channels/ebay/callback", // eBay OAuth redirect target — no session
  "/docs",
  "/api/docs",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  if (isPublicRoute) {
    return NextResponse.next()
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    cookieName,
  })

  if (!token) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
