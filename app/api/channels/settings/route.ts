import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  quantityBuffer: z.number().int().min(0).max(1000),
  syncIntervalMins: z.number().int().min(5).max(1440),
  orderPollMins: z.number().int().min(5).max(1440),
  autoSyncEnabled: z.boolean(),
  shippingSpeed: z.enum(["Standard", "Expedited", "Priority"]),
})

export async function GET() {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const cfg = await prisma.channelsSyncConfig.findUnique({
    where: { organizationId: result.organizationId },
  })
  return NextResponse.json(
    cfg ?? {
      quantityBuffer: 5,
      syncIntervalMins: 30,
      orderPollMins: 15,
      autoSyncEnabled: true,
      shippingSpeed: "Standard",
    },
  )
}

export async function PUT(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  const body = await req.json()
  const data = schema.parse(body)
  const updated = await prisma.channelsSyncConfig.upsert({
    where: { organizationId: result.organizationId },
    create: { organizationId: result.organizationId, ...data },
    update: data,
  })
  return NextResponse.json(updated)
}
