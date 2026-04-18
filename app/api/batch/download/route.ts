import { NextRequest, NextResponse } from "next/server"
import archiver from "archiver"
import { PassThrough } from "stream"

interface DownloadItem {
  url: string
  fileName: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { batchId, items, zipName } = body as {
      batchId?: string
      items: DownloadItem[]
      zipName?: string
    }

    if (!items?.length) {
      return NextResponse.json({ error: "items required" }, { status: 400 })
    }

    const archive = archiver("zip", { zlib: { level: 5 } })
    const passThrough = new PassThrough()
    archive.pipe(passThrough)

    await Promise.all(
      items.map(async (item) => {
        try {
          const res = await fetch(item.url)
          if (!res.ok) throw new Error(`fetch ${item.url} -> ${res.status}`)
          const buf = Buffer.from(await res.arrayBuffer())
          archive.append(buf, { name: item.fileName })
        } catch (err) {
          console.error(`zip skip ${item.fileName}:`, err)
        }
      })
    )

    await archive.finalize()

    const chunks: Buffer[] = []
    for await (const chunk of passThrough) chunks.push(Buffer.from(chunk))
    const zipBuffer = Buffer.concat(chunks)

    const name = zipName || `${batchId || "images"}.zip`
    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    })
  } catch (err) {
    console.error("batch download error:", err)
    return NextResponse.json({ error: "zip failed" }, { status: 500 })
  }
}
