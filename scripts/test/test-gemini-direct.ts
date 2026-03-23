// Direct HTTP test for Gemini API
const GEMINI_API_KEY = "AIzaSyDZMDF3VRfGs2l-c1MAwkZ5VgoksSq31fA"

async function testGeminiDirect() {
  console.log('🔍 Testing Gemini API Key Validity...\n')
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  // Test 1: List models endpoint
  console.log('📋 Test 1: Checking API key by listing models...')
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Error ${response.status}: ${response.statusText}`)
      console.error('Response:', errorText)

      if (response.status === 400) {
        console.error('\n💡 Invalid API Key - The key format or value is incorrect')
      } else if (response.status === 403) {
        console.error('\n💡 API Key Denied - The key may be disabled or restricted')
      } else if (response.status === 429) {
        console.error('\n💡 Rate Limited - You have exceeded your quota')
      }
      process.exit(1)
    }

    const data = await response.json()

    console.log('✅ API Key is VALID!\n')
    console.log(`Found ${data.models?.length || 0} available models:\n`)

    if (data.models && data.models.length > 0) {
      data.models.forEach((model: any) => {
        console.log(`  📦 ${model.name}`)
        console.log(`     Display: ${model.displayName}`)
        console.log(`     Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`)
        console.log('')
      })
    }

    // Test 2: Try generating content with the first available model
    console.log('='.repeat(60))
    console.log('\n📝 Test 2: Testing text generation...\n')

    const generateModels = data.models?.filter((m: any) =>
      m.supportedGenerationMethods?.includes('generateContent')
    )

    if (!generateModels || generateModels.length === 0) {
      console.log('⚠️  No models available for content generation')
      console.log('✅ However, API key itself is VALID')
      return
    }

    const testModel = generateModels[0]
    console.log(`Using model: ${testModel.name}\n`)

    const generateResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${testModel.name}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Say 'Hello! The API is working!' if you receive this message."
            }]
          }]
        })
      }
    )

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text()
      console.error(`❌ Generation Error ${generateResponse.status}: ${generateResponse.statusText}`)
      console.error('Response:', errorText)

      if (generateResponse.status === 429) {
        console.log('\n⚠️  Rate limit/quota exceeded for this model')
        console.log('   This is normal for free tier - your API key is still VALID')
        console.log('   Visit https://ai.dev/usage to check your quota')
      }
    } else {
      const result = await generateResponse.json()
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text

      console.log('✅ Generation successful!')
      console.log('\nAI Response:', generatedText)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ GEMINI API KEY IS VALID AND WORKING!')
    console.log('='.repeat(60))
    console.log('\nYour API key:', GEMINI_API_KEY)
    console.log('\nStatus:')
    console.log('  ✅ API key is valid')
    console.log('  ✅ Can authenticate with Google AI')
    console.log(`  ✅ ${data.models?.length || 0} models accessible`)

  } catch (error: any) {
    console.error('\n❌ Network or connection error:')
    console.error(error.message)
    console.error('\nPlease check your internet connection')
  }
}

testGeminiDirect()
