import { GoogleGenerativeAI } from "@google/generative-ai"
import * as dotenv from "dotenv"
import path from "path"
import fs from "fs/promises"

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""

const PROMPT_GENERATION_INSTRUCTION = `You are an expert product photographer and AI image generation prompt engineer.

Analyze this jewelry product image carefully and generate a detailed prompt that can be used with an AI image generation model (like Gemini Imagen) to recreate this product in various lifestyle/marketing scenes.

Your prompt should:
1. Describe the jewelry piece in precise detail (type, metal color, stones, design, finish, size impression)
2. Be written in a way that an image generation AI can use it directly
3. Focus on the PRODUCT details, not the background (since we want to place it in new scenes)
4. Include details about reflections, sparkle, and material qualities

Output format:
- First, output a section called "PRODUCT DESCRIPTION:" with a 2-3 sentence description of what the jewelry is
- Then output a section called "GENERATION PROMPT:" with the actual prompt that can be used for image generation. This should be a single paragraph, detailed but concise (around 50-100 words)
- Then output a section called "EXAMPLE SCENE PROMPTS:" with 3 example prompts that combine the product description with different lifestyle scenes (each ~80-120 words)

Keep the language precise and photography-focused.`

async function testPromptFromImage(imagePath: string) {
  console.log('='.repeat(60))
  console.log('Testing: Generate Prompt from Jewelry Image')
  console.log('='.repeat(60))
  console.log('\nImage:', imagePath)
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set in .env')
    process.exit(1)
  }

  try {
    // Read the image
    const imageBuffer = await fs.readFile(imagePath)
    const base64Image = imageBuffer.toString('base64')
    console.log(`Image loaded: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`)

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

    console.log('Sending image to Gemini 2.0 Flash for analysis...\n')

    const result = await model.generateContent([
      PROMPT_GENERATION_INSTRUCTION,
      {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg"
        }
      }
    ])

    const response = await result.response
    const text = response.text()

    console.log('='.repeat(60))
    console.log('GEMINI RESPONSE:')
    console.log('='.repeat(60))
    console.log(text)
    console.log('\n' + '='.repeat(60))
    console.log('TEST COMPLETE')
    console.log('='.repeat(60))

    return text
  } catch (error: any) {
    console.error('\nERROR:', error.message)
    if (error.status === 429) {
      console.error('Rate limited - wait a moment and try again')
    }
    process.exit(1)
  }
}

// Run with test images
async function main() {
  // Test with two different jewelry images from different products
  const testImages = [
    path.join(process.cwd(), 'public/uploads/source-images/cmk2dnc8n0000h4ewan4ni6kb/MAIN_0_58d77fec.jpg'),
    path.join(process.cwd(), 'public/uploads/source-images/cmk2dnfni000nh4ewtw3w419x/MAIN_0_b89f3675.jpg'),
  ]

  for (const imagePath of testImages) {
    try {
      await fs.access(imagePath)
      await testPromptFromImage(imagePath)
      console.log('\n\n')
    } catch {
      console.log(`Skipping ${imagePath} - file not found`)
    }
  }
}

main()
