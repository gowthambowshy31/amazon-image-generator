// Test free tier Gemini models
const GEMINI_API_KEY = "AIzaSyDZMDF3VRfGs2l-c1MAwkZ5VgoksSq31fA"

async function testFreeModels() {
  console.log('🆓 Testing FREE TIER Gemini Models...\n')
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  const freeModels = [
    { name: 'gemini-2.5-flash', description: 'Latest Gemini 2.5 Flash (Free)' },
    { name: 'gemini-2.0-flash', description: 'Gemini 2.0 Flash (Free)' },
    { name: 'gemini-flash-lite-latest', description: 'Gemini Flash-Lite Latest (Free)' },
    { name: 'gemma-3-4b-it', description: 'Gemma 3 4B - Open Source (Free)' },
  ]

  console.log('Testing the following free models:\n')

  for (const model of freeModels) {
    console.log('='.repeat(60))
    console.log(`\n📦 Testing: ${model.name}`)
    console.log(`   ${model.description}\n`)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Respond with exactly: 'Working!' if you receive this."
              }]
            }]
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`   ❌ Error ${response.status}: ${response.statusText}`)

        if (response.status === 429) {
          console.error('   ⚠️  Rate limit exceeded - wait and try again')
        } else if (response.status === 400) {
          console.error('   ⚠️  Model may require payment or different access')
        } else {
          console.error('   Details:', errorText.substring(0, 200))
        }
        continue
      }

      const result = await response.json()
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text

      console.log(`   ✅ SUCCESS!`)
      console.log(`   Response: ${generatedText}`)
      console.log(`   ✓ This model is FREE and working!`)

    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message)
    }
  }

  // Test image generation with free Imagen models
  console.log('\n' + '='.repeat(60))
  console.log('\n🎨 Testing FREE IMAGE GENERATION Models...\n')

  const imageModels = [
    { name: 'gemini-2.5-flash-image', description: 'Gemini 2.5 Flash Image (Text-to-Image)' },
    { name: 'imagen-4.0-fast-generate-001', description: 'Imagen 4 Fast (Paid - Testing access)' },
  ]

  for (const model of imageModels) {
    console.log('='.repeat(60))
    console.log(`\n🖼️  Testing: ${model.name}`)
    console.log(`   ${model.description}\n`)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "A simple red apple on a white background"
              }]
            }]
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`   ❌ Error ${response.status}: ${response.statusText}`)

        if (response.status === 429) {
          console.error('   ⚠️  Rate limit exceeded')
        } else if (response.status === 400 || response.status === 403) {
          console.error('   ⚠️  May require billing/payment enabled')
        } else {
          console.error('   Details:', errorText.substring(0, 200))
        }
        continue
      }

      const result = await response.json()

      // Check for image data
      let hasImageData = false
      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            hasImageData = true
            const imageSize = part.inlineData.data.length
            console.log(`   ✅ SUCCESS! Image generated!`)
            console.log(`   Image data size: ${(imageSize / 1024).toFixed(2)} KB (base64)`)
            console.log(`   MIME type: ${part.inlineData.mimeType}`)
            console.log(`   ✓ This model can generate images!`)
            break
          }
        }
      }

      if (!hasImageData) {
        console.log(`   ⚠️  Response received but no image data found`)
        console.log(`   Response:`, JSON.stringify(result).substring(0, 200))
      }

    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('\n📊 SUMMARY - FREE TIER MODELS')
  console.log('='.repeat(60))
  console.log('\nRecommended FREE models for your app:')
  console.log('\n✅ Text Generation (FREE):')
  console.log('   - gemini-2.5-flash (Best, fastest, free)')
  console.log('   - gemini-2.0-flash (Reliable, free)')
  console.log('   - gemini-flash-lite-latest (Lighter, free)')
  console.log('   - gemma-3-4b-it (Open source, free)')
  console.log('\n🎨 Image Generation:')
  console.log('   - gemini-2.5-flash-image (Check if working above)')
  console.log('   - imagen-4.0-* models (May require billing)')
  console.log('\n💡 Tip: Use gemini-2.5-flash for text/vision tasks - it\'s fast and free!')
}

testFreeModels()
