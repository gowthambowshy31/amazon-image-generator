import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { findDoc } from "@/app/docs/docs-manifest"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const meta = findDoc(slug)
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), "docs", meta.file)
    const content = await fs.readFile(filePath, "utf8")
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    return NextResponse.json({ error: "File not accessible" }, { status: 500 })
  }
}
