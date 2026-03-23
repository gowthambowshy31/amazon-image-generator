import { GoogleGenerativeAI } from "@google/generative-ai"
import * as dotenv from "dotenv"
import path from "path"

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDZMDF3VRfGs2l-c1MAwkZ5VgoksSq31fA"

async function testGeminiAPI() {
  console.log('🔍 Testing Gemini API Connection...\n')
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

    // Step 1: List available models
    console.log('📋 Step 1: Listing available models...')
    try {
      const models = await genAI.listModels()
      console.log('\nAvailable models:')
      for await (const model of models) {
        console.log(`  - ${model.name}`)
        console.log(`    Supported methods: ${model.supportedGenerationMethods?.join(', ')}`)
      }
    } catch (error: any) {
      console.log('⚠️  Could not list models:', error.message)
    }

    console.log('\n' + '='.repeat(60))
    console.log('\n📝 Step 2: Testing text generation with gemini-pro...')

    const model = genAI.getGenerativeModel({ model: "gemini-pro" })
    const result = await model.generateContent("Hello! Please respond with 'API is working!' if you receive this.")
    const response = await result.response
    const text = response.text()

    console.log('\n✅ Success! Gemini API Response:')
    console.log('  ', text)

    console.log('\n' + '='.repeat(60))
    console.log('✅ GEMINI API IS WORKING CORRECTLY!')
    console.log('='.repeat(60))
    console.log('\n✓ API Key is valid')
    console.log('✓ Can connect to Gemini API')
    console.log('✓ Text generation is functional')
    console.log('\nYou can now use this API key in your application.')

  } catch (error: any) {
    console.error('\n❌ ERROR testing Gemini API:')
    console.error('Message:', error.message)

    if (error.message?.includes('API key')) {
      console.error('\n💡 API Key Issue:')
      console.error('   - Verify the API key is correct')
      console.error('   - Check if the API key is enabled at https://aistudio.google.com/app/apikey')
      console.error('   - Ensure billing is set up if required')
    }

    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('limit')) {
      console.error('\n💡 Quota/Rate Limit Issue:')
      console.error('   - You may have exceeded the free tier limits')
      console.error('   - Check usage at: https://ai.dev/usage?tab=rate-limit')
      console.error('   - Consider waiting a few minutes and trying again')
      console.error('   - May need to enable billing for higher limits')
    }

    if (error.status === 404) {
      console.error('\n💡 Model Not Found:')
      console.error('   - The model may not be available with your API key')
      console.error('   - Try listing available models above')
    }

    console.error('\nFull error details:', error)
    process.exit(1)
  }
}

// Run the test
testGeminiAPI()
