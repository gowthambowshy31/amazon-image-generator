import { NextRequest, NextResponse } from "next/server"

function manifestUrl(batchId: string) {
  const bucket = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
  const region = process.env.AWS_REGION || "eu-north-1"
  return `https://${bucket}.s3.${region}.amazonaws.com/client-batches/${encodeURIComponent(batchId)}/manifest.json`
}

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batch")
  if (!batchId) return NextResponse.json({ error: "batch required" }, { status: 400 })

  const res = await fetch(manifestUrl(batchId), { cache: "no-store" })
  if (!res.ok) {
    return NextResponse.json({ error: `manifest not found (${res.status})` }, { status: 404 })
  }
  const manifest = await res.json()
  return NextResponse.json(manifest, {
    headers: { "Cache-Control": "no-store" },
  })
}
