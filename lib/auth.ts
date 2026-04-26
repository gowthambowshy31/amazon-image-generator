import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { Resend } from "resend"
import crypto from "crypto"

const cookieName = "image-gen-platform.session-token"

export { cookieName }

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

async function sendMagicLinkEmail(email: string, url: string) {
  if (!resend) return
  const fromAddr = process.env.RESEND_FROM_EMAIL || "noreply@bowshai.com"
  await resend.emails.send({
    from: fromAddr,
    to: email,
    subject: "Sign in to Bowshai Seller Platform",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111;">Sign in to Bowshai Seller Platform</h2>
        <p>Click the button below to sign in. This link expires in 1 hour.</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none;">Sign in</a>
        </p>
        <p style="color: #666; font-size: 12px;">Or paste this URL: ${url}</p>
      </div>
    `,
  })
}

const providers: any[] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null

      const user = await prisma.user.findUnique({
        where: { email: credentials.email as string }
      })
      if (!user || !user.password) return null

      const isPasswordValid = await bcrypt.compare(
        credentials.password as string,
        user.password
      )
      if (!isPasswordValid) return null

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      }
    }
  })
]

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  )
}

if (process.env.RESEND_API_KEY) {
  providers.push({
    id: "email",
    type: "email",
    name: "Email",
    server: { host: "resend", port: 587, auth: { user: "resend", pass: process.env.RESEND_API_KEY } },
    from: process.env.RESEND_FROM_EMAIL || "noreply@bowshai.com",
    maxAge: 60 * 60, // 1 hour
    async generateVerificationToken() {
      return crypto.randomBytes(32).toString("hex")
    },
    async sendVerificationRequest({ identifier, url }: any) {
      await sendMagicLinkEmail(identifier, url)
    },
  } as any)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: cookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth/email signups, ensure the User has a role/org default and update lastLoginAt
      if (account?.provider !== "credentials" && user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } })
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id as string
        token.role = (user as any).role
        token.organizationId = (user as any).organizationId
      }
      // Refresh role/org from DB if missing (OAuth first-login)
      if (!token.role && token.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email as string } })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.organizationId = dbUser.organizationId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
        (session.user as any).role = token.role as string
        (session.user as any).organizationId = (token as any).organizationId
      }
      return session
    },
  },
  providers,
})
