import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = schema.parse(body)

    const existing = await prisma.waitlist.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ message: "Already on waitlist", status: existing.status })
    }

    const entry = await prisma.waitlist.create({
      data: { email: data.email, name: data.name, company: data.company, status: "pending" },
    })
    return NextResponse.json({ message: "Joined waitlist", id: entry.id }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 })
    }
    console.error("Waitlist error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
