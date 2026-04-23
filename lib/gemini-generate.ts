const DEFAULT_MODEL = "gemini-3-pro-image-preview"

export interface GeminiImageInput {
  buffer: Buffer
  mime: string
}

export interface GeminiImageOutput {
  buffer: Buffer
  mime: string
}

/**
 * Generate an image via Gemini. If `source` is provided, does image-to-image;
 * otherwise text-to-image.
 */
export async function generateGeminiImage(params: {
  prompt: string
  source?: GeminiImageInput
  model?: string
}): Promise<GeminiImageOutput> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  const model = params.model || DEFAULT_MODEL
  const parts: any[] = []
  if (params.source) {
    parts.push({
      inlineData: {
        data: params.source.buffer.toString("base64"),
        mimeType: params.source.mime,
      },
    })
  }
  parts.push({ text: params.prompt })

  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["image", "text"] },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const imgPart = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
  if (!imgPart?.inlineData?.data) {
    throw new Error("No image in Gemini response")
  }

  return {
    buffer: Buffer.from(imgPart.inlineData.data, "base64"),
    mime: imgPart.inlineData.mimeType || "image/png",
  }
}
