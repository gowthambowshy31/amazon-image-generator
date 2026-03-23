// Test the current API key from .env file
import * as dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.join(process.cwd(), '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

async function testCurrentAPIKey() {
  console.log('🔍 Testing Current Gemini API Key from .env...\n')
  
  if (!GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY is not set in .env file')
    process.exit(1)
  }

  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  // Test 1: List models endpoint
  console.log('📋 Test 1: Checking API key by listing models...')
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`❌ Error ${response.status}: ${response.statusText}`)
      console.error('Response:', JSON.stringify(errorData, null, 2))

      if (response.status === 400) {
        console.error('\n💡 Invalid API Key - The key format or value is incorrect')
      } else if (response.status === 403) {
        console.error('\n💡 API Key Denied - The key may be:')
        console.error('   - Disabled or restricted')
        console.error('   - Reported as leaked')
        console.error('   - Expired or revoked')
        console.error('   - Missing required permissions')
      } else if (response.status === 429) {
        console.error('\n💡 Rate Limited - You have exceeded your quota')
      }
      process.exit(1)
    }

    const data = await response.json()
    console.log('✅ API Key is VALID!\n')
    console.log(`Found ${data.models?.length || 0} available models\n`)

    // Test 2: Try generating content
    console.log('='.repeat(60))
    console.log('\n📝 Test 2: Testing text generation with gemini-2.5-flash...\n')

    const generateResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Say hello and confirm the API is working!'
            }]
          }]
        })
      }
    )

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json()
      console.error(`❌ Generation Error ${generateResponse.status}: ${generateResponse.statusText}`)
      console.error('Response:', JSON.stringify(errorData, null, 2))
      
      if (generateResponse.status === 403) {
        console.error('\n💡 API Key Issue Detected:')
        if (errorData.error?.message?.includes('leaked')) {
          console.error('   ⚠️  Your API key was reported as leaked. Please create a new one.')
        } else if (errorData.error?.message?.includes('quota')) {
          console.error('   ⚠️  Quota exceeded or billing not enabled.')
        } else {
          console.error('   ⚠️  Permission denied. Check API key restrictions.')
        }
        process.exit(1)
      }
    } else {
      const generateData = await generateResponse.json()
      console.log('✅ Text generation working!')
      console.log('Response:', generateData.candidates?.[0]?.content?.parts?.[0]?.text || 'No text in response')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ GEMINI API KEY IS VALID AND WORKING!')
    console.log('='.repeat(60))
    console.log('\nYour API key:', GEMINI_API_KEY)
    console.log('\nStatus:')
    console.log('  ✅ API key is valid')
    console.log('  ✅ Can authenticate with Google AI')
    console.log('  ✅ Text generation is working')

  } catch (error: any) {
    console.error('\n❌ ERROR testing Gemini API:')
    console.error('Message:', error.message)
    process.exit(1)
  }
}

testCurrentAPIKey()
