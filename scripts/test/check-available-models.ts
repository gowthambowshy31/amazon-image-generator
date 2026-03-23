import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

async function checkAvailableModels() {
  console.log('🔍 Checking available Gemini models...\n')
  console.log('API Key:', process.env.GEMINI_API_KEY?.substring(0, 20) + '...')
  console.log('='.repeat(80))

  // Try different models
  const modelsToTry = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro-vision',
    'imagen-3.0-generate-001',
    'imagen-3.0-fast-generate-001',
    'imagen-2.0-generate-001'
  ]

  for (const modelName of modelsToTry) {
    try {
      console.log(`\nTesting: ${modelName}`)
      const model = genAI.getGenerativeModel({ model: modelName })

      // Try a simple text generation
      const result = await model.generateContent(['Hello, can you respond?'])
      const response = await result.response
      const text = response.text()

      console.log(`✅ ${modelName} - AVAILABLE`)
      console.log(`   Response: ${text.substring(0, 50)}...`)
    } catch (error: any) {
      if (error.status === 403) {
        console.log(`❌ ${modelName} - FORBIDDEN (not available with this API key)`)
      } else if (error.status === 404) {
        console.log(`❌ ${modelName} - NOT FOUND (model doesn't exist)`)
      } else {
        console.log(`❌ ${modelName} - ERROR: ${error.message}`)
      }
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('\n💡 RECOMMENDATION:')
  console.log('Gemini Imagen is not available with standard API keys.')
  console.log('For AI image generation, consider these alternatives:')
  console.log('  1. OpenAI DALL-E 3 - Most reliable, good quality')
  console.log('  2. Stability AI - Open source, cheaper')
  console.log('  3. Replicate - Multiple models available')
  console.log('  4. Use Gemini Vision to analyze + Sharp to enhance images')
}

checkAvailableModels()
