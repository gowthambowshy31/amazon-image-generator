// Test image generation with current API key
import * as dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.join(process.cwd(), '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

async function testImageGeneration() {
  console.log('🎨 Testing Gemini Image Generation API...\n')
  
  if (!GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY is not set in .env file')
    process.exit(1)
  }

  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  // Test the exact endpoint used by the app
  console.log('📋 Testing gemini-2.5-flash-image endpoint (used by the app)...\n')
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'A simple red circle on white background'
            }]
          }]
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`❌ Error ${response.status}: ${response.statusText}`)
      console.error('Response:', JSON.stringify(errorData, null, 2))

      if (response.status === 403) {
        console.error('\n💡 API Key Issue:')
        if (errorData.error?.message?.includes('leaked')) {
          console.error('   ⚠️  Your API key was reported as leaked. Please create a new one.')
        } else if (errorData.error?.message?.includes('quota') || errorData.error?.message?.includes('billing')) {
          console.error('   ⚠️  Quota exceeded or billing not enabled.')
          console.error('   💡 Image generation requires billing to be enabled in Google Cloud Console')
        } else if (errorData.error?.message?.includes('permission') || errorData.error?.message?.includes('denied')) {
          console.error('   ⚠️  Permission denied. The API key may not have access to image generation.')
        } else {
          console.error('   ⚠️  Permission denied. Check API key restrictions.')
        }
        console.error('\n📝 To fix this:')
        console.error('   1. Go to https://aistudio.google.com/app/apikey')
        console.error('   2. Create a new API key')
        console.error('   3. Enable billing at https://console.cloud.google.com/billing')
        console.error('   4. Update GEMINI_API_KEY in your .env file')
      } else if (response.status === 429) {
        console.error('\n💡 Rate Limited - You have exceeded your quota for today')
      } else if (response.status === 400) {
        console.error('\n💡 Bad Request - Check the request format')
      }
      process.exit(1)
    }

    const data = await response.json()
    console.log('✅ Image generation API is working!')
    console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 500) + '...')
    
    // Check if we got image data
    const candidate = data.candidates?.[0]
    if (candidate?.content?.parts?.[0]?.inlineData) {
      console.log('\n✅ Image data received!')
      console.log('   Image data size:', candidate.content.parts[0].inlineData.data.length, 'characters (base64)')
    } else {
      console.log('\n⚠️  Response received but no image data found')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ GEMINI IMAGE GENERATION API IS WORKING!')
    console.log('='.repeat(60))

  } catch (error: any) {
    console.error('\n❌ ERROR testing image generation:')
    console.error('Message:', error.message)
    process.exit(1)
  }
}

testImageGeneration()
