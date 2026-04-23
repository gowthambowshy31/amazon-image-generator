import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateApiKey } from "@/lib/api-key-auth"

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category")

  const templates = await prisma.promptTemplate.findMany({
    where: {
      isActive: true,
      ...(category && category !== "all"
        ? { OR: [{ category }, { category: "both" }] }
        : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      promptText: true,
      category: true,
      variables: {
        select: {
          name: true,
          displayName: true,
          type: true,
          isRequired: true,
          defaultValue: true,
          options: true,
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
  })

  return NextResponse.json({ templates })
}
