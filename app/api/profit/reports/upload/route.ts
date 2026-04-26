import { NextRequest, NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/auth-helpers"
import { importProfitabilityReport } from "@/lib/profit/excel"

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const result = await requireOrgAccess()
  if (result.error) return result.error
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const summary = await importProfitabilityReport(result.organizationId, file.name, buffer)
    return NextResponse.json(summary)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
