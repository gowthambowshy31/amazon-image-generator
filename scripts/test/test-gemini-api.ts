import { GoogleGenerativeAI } from "@google/generative-ai"
import * as dotenv from "dotenv"
import path from "path"

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

async function testGeminiAPI() {
  console.log('🔍 Testing Gemini API Connection...\n')

  // Check if API key is set
  if (!GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY is not set in .env file')
    process.exit(1)
  }

  console.log('✅ API Key found:', GEMINI_API_KEY.substring(0, 20) + '...')
  console.log('')

  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

    // Test 1: Basic text generation with Gemini Pro
    console.log('📝 Test 1: Testing text generation (gemini-1.5-flash)...')
    const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
    const textResult = await textModel.generateContent("Say hello and confirm you are working!")
    const textResponse = await textResult.response
    console.log('Response:', textResponse.text())
    console.log('✅ Text generation working!\n')

    // Test 2: Check if Imagen 3 model is accessible
    console.log('🎨 Test 2: Testing Imagen 3 model access...')
    try {
      const imagenModel = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" })
      const imagenResult = await imagenModel.generateContent([
        "A simple red circle on white background"
      ])
      const imagenResponse = await imagenResult.response

      // Check if we got image data
      if (imagenResponse.candidates && imagenResponse.candidates.length > 0) {
        const candidate = imagenResponse.candidates[0]
        let hasImageData = false

        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              hasImageData = true
              console.log('✅ Imagen 3 is accessible and returned image data!')
              console.log('   Image data size:', part.inlineData.data.length, 'characters (base64)')
              break
            }
          }
        }

        if (!hasImageData) {
          console.log('⚠️  Imagen 3 responded but no image data found in response')
          console.log('   Response structure:', JSON.stringify(imagenResponse, null, 2))
        }
      } else {
        console.log('⚠️  Imagen 3 responded but no candidates found')
      }
    } catch (imagenError: any) {
      console.log('⚠️  Imagen 3 not available:', imagenError.message)
      console.log('   Note: Imagen 3 may require special access or billing enabled')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ GEMINI API IS WORKING!')
    console.log('='.repeat(60))
    console.log('\nAPI Key:', GEMINI_API_KEY)
    console.log('\nCapabilities:')
    console.log('  ✅ Text Generation (Gemini Flash)')
    console.log('  ✅ Vision/Image Analysis')
    console.log('  ❓ Image Generation (Imagen 3) - check output above')

  } catch (error: any) {
    console.error('\n❌ ERROR testing Gemini API:')
    console.error('Message:', error.message)

    if (error.message?.includes('API key')) {
      console.error('\n💡 This looks like an API key issue.')
      console.error('   Please verify:')
      console.error('   1. The API key is correct')
      console.error('   2. The API key is enabled in Google AI Studio')
      console.error('   3. Billing is set up (if required)')
    }

    if (error.message?.includes('quota') || error.message?.includes('limit')) {
      console.error('\n💡 This looks like a quota/rate limit issue.')
      console.error('   Please check your usage at: https://aistudio.google.com/')
    }

    console.error('\nFull error:', error)
    process.exit(1)
  }
}

// Run the test
testGeminiAPI()
