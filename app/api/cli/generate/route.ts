import { NextRequest, NextResponse } from "next/server"
import { authenticateApiKey } from "@/lib/api-key-auth"
import { generateGeminiImage } from "@/lib/gemini-generate"
import { uploadToS3 } from "@/lib/s3"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

function extFromMime(mime: string): string {
  if (mime.includes("jpeg")) return "jpg"
  if (mime.includes("webp")) return "webp"
  return "png"
}

function applyTemplateVars(promptText: string, vars: Record<string, string>): string {
  return promptText.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => vars[name] ?? "")
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth.error) return auth.error
  const { user } = auth

  try {
    const contentType = request.headers.get("content-type") || ""

    let sourceBuffer: Buffer | null = null
    let sourceMime = "image/jpeg"
    let sourceName = "image"
    let prompt = ""
    let templateId: string | null = null
    let variablesJson: Record<string, string> = {}
    let variants = 1
    let batchId: string | null = null
    let model: string | undefined

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("image") as File | null
      if (file) {
        const ab = await file.arrayBuffer()
        sourceBuffer = Buffer.from(ab)
        sourceMime = file.type || "image/jpeg"
        sourceName = file.name || "image"
      }
      prompt = String(form.get("prompt") || "")
      templateId = (form.get("templateId") as string) || null
      variants = Math.max(1, Math.min(10, parseInt(String(form.get("variants") || "1"), 10) || 1))
      batchId = (form.get("batchId") as string) || null
      model = (form.get("model") as string) || undefined
      const varsRaw = form.get("variables")
      if (typeof varsRaw === "string" && varsRaw.length > 0) {
        try {
          variablesJson = JSON.parse(varsRaw)
        } catch {
          /* ignore */
        }
      }
    } else {
      const body = await request.json()
      prompt = body.prompt || ""
      templateId = body.templateId || null
      variants = Math.max(1, Math.min(10, parseInt(body.variants ?? 1, 10) || 1))
      batchId = body.batchId || null
      model = body.model
      variablesJson = body.variables || {}

      if (body.sourceUrl) {
        const srcRes = await fetch(body.sourceUrl)
        if (!srcRes.ok) throw new Error(`Source fetch failed: ${srcRes.status}`)
        sourceBuffer = Buffer.from(await srcRes.arrayBuffer())
        sourceMime = srcRes.headers.get("content-type") || "image/jpeg"
        sourceName = body.sourceName || "source"
      } else if (body.sourceBase64) {
        sourceBuffer = Buffer.from(body.sourceBase64, "base64")
        sourceMime = body.sourceMime || "image/jpeg"
        sourceName = body.sourceName || "source"
      }
    }

    if (templateId) {
      const tmpl = await prisma.promptTemplate.findUnique({ where: { id: templateId } })
      if (!tmpl) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }
      prompt = applyTemplateVars(tmpl.promptText, variablesJson)
    }

    if (!prompt) {
      return NextResponse.json({ error: "prompt or templateId required" }, { status: 400 })
    }

    const effectiveBatchId = batchId || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const stem = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_") || "image"

    const tasks = Array.from({ length: variants }, (_, i) => i + 1).map(async (variantIndex) => {
      try {
        const out = await generateGeminiImage({
          prompt,
          source: sourceBuffer ? { buffer: sourceBuffer, mime: sourceMime } : undefined,
          model,
        })
        const ext = extFromMime(out.mime)
        const ts = Date.now()
        const key = `client-batches/${effectiveBatchId}/${stem}_v${variantIndex}_r${ts}.${ext}`
        const up = await uploadToS3({ buffer: out.buffer, key, contentType: out.mime })
        if (!up.success || !up.url) throw new Error(up.error || "upload failed")
        return { variantIndex, url: up.url, key, size: out.buffer.length, mime: out.mime }
      } catch (err) {
        return { variantIndex, error: (err as Error).message }
      }
    })

    const results = await Promise.all(tasks)
    const successes = results.filter((r) => "url" in r)
    const failures = results.filter((r) => "error" in r)

    return NextResponse.json({
      batchId: effectiveBatchId,
      source: sourceName,
      prompt,
      variants,
      results,
      succeeded: successes.length,
      failed: failures.length,
    })
  } catch (err) {
    console.error("cli/generate error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
