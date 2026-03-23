import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { z } from "zod"
import { generatePromptFromImage } from "@/lib/gemini"

const imageSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
})

const requestSchema = z.object({
  images: z.array(imageSchema).min(1).max(10),
})

const ANALYSIS_PROMPT = `You are an expert product photographer and AI image generation prompt engineer specializing in jewelry photography for e-commerce listings.

Analyze this jewelry product image to understand the TYPE and CATEGORY of jewelry, then generate ONE detailed, GENERIC and REUSABLE prompt that works for ANY piece of jewelry in this same category.

IMPORTANT: The prompt must NOT be specific to this exact piece. It should be a reusable template prompt that works for any similar jewelry item. For example:
- If you see diamond hoop earrings, write a prompt that works for ANY hoop earrings (not just this specific pair)
- If you see a gold chain necklace, write a prompt that works for ANY chain necklace
- Use generic terms like "the jewelry piece", "the earrings", "the necklace" instead of overly specific descriptions

Your response MUST follow this exact format:

PRODUCT_DESCRIPTION:
[2-3 sentence description of what category/type of jewelry this is]

GENERATION_PROMPT:
[A single, detailed paragraph of 150-250 words. This must be a REUSABLE image generation prompt for this category of jewelry. Include:
- The general jewelry category and style (e.g., hoop earrings, pendant necklace, tennis bracelet)
- General material descriptors (e.g., polished metal, precious stones) rather than exact specs
- How light should interact with this type of jewelry (reflections, sparkle, brilliance)
- Professional photography setup: lighting style, background, camera angle, composition
- Surface quality expectations: polish, shimmer, clarity of stones
- Scene/mood: elegant, luxurious, clean, modern
- Amazon listing quality requirements: clean background, high detail, commercial appeal

The prompt should work as a DROP-IN template for any piece of jewelry in this category. When used with a source image, the AI model will combine this prompt with the actual product to generate the final image. Write it as a direct image generation instruction. Professional product photography quality, suitable for Amazon listing imagery.]

Keep language precise, technical, and photography-focused.`

interface AnalysisResult {
  productDescription: string
  generationPrompt: string
}

function parseAnalysisResponse(text: string): AnalysisResult {
  const result: AnalysisResult = {
    productDescription: "",
    generationPrompt: "",
  }

  // Extract product description
  const descMatch = text.match(
    /PRODUCT_DESCRIPTION:\s*([\s\S]*?)(?=GENERATION_PROMPT:|$)/i
  )
  if (descMatch) {
    result.productDescription = descMatch[1].trim()
  }

  // Extract generation prompt
  const promptMatch = text.match(
    /GENERATION_PROMPT:\s*([\s\S]*?)$/i
  )
  if (promptMatch) {
    result.generationPrompt = promptMatch[1].trim()
  }

  // Fallback: if parsing failed, use the whole text as the prompt
  if (!result.generationPrompt) {
    result.generationPrompt = text.trim()
    result.productDescription = "Could not parse structured response from AI."
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const validated = requestSchema.parse(body)

    const results = []

    for (const image of validated.images) {
      try {
        console.log(`Analyzing image: ${image.fileName}`)
        const rawResponse = await generatePromptFromImage(
          image.base64,
          image.mimeType,
          ANALYSIS_PROMPT
        )

        const analysis = parseAnalysisResponse(rawResponse)

        results.push({
          fileName: image.fileName,
          success: true,
          analysis,
        })
        console.log(`Successfully analyzed: ${image.fileName}`)
      } catch (error) {
        console.error(`Failed to analyze ${image.fileName}:`, error)
        results.push({
          fileName: image.fileName,
          success: false,
          error: error instanceof Error ? error.message : "Analysis failed",
          analysis: null,
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error in generate-prompt:", error)
    return NextResponse.json(
      { error: "Failed to generate prompts" },
      { status: 500 }
    )
  }
}
