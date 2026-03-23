// Test new Gemini API key
const GEMINI_API_KEY = "AIzaSyBL-e8_H0s_HMrmg1WCw41E6NJJ3zcgC-8"

async function testNewAPIKey() {
  console.log('🔍 Testing New Gemini API Key...\n')
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...\n')

  try {
    // Test 1: Validate API key by listing models
    console.log('📋 Step 1: Validating API key...')
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Error ${response.status}: ${response.statusText}`)
      console.error('Response:', errorText)
      process.exit(1)
    }

    const data = await response.json()
    console.log('✅ API Key is VALID!\n')
    console.log(`Found ${data.models?.length || 0} available models\n`)

    // Test 2: Text generation
    console.log('='.repeat(60))
    console.log('\n📝 Step 2: Testing text generation...\n')

    const textResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Say 'Hello! API is working!' if you receive this."
            }]
          }]
        })
      }
    )

    if (!textResponse.ok) {
      const errorText = await textResponse.text()
      console.error(`❌ Error ${textResponse.status}:`, errorText.substring(0, 300))
    } else {
      const result = await textResponse.json()
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text
      console.log('✅ Text Generation Working!')
      console.log('Response:', text)
    }

    // Test 3: Image generation with Gemini Flash Image
    console.log('\n' + '='.repeat(60))
    console.log('\n🎨 Step 3: Testing image generation (gemini-2.5-flash-image)...\n')

    const imageResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Generate a simple image: A red apple on a white background"
            }]
          }]
        })
      }
    )

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text()
      console.log(`⚠️  Image generation error ${imageResponse.status}`)

      if (imageResponse.status === 429) {
        console.log('   Rate limited - quota exceeded')
      } else if (imageResponse.status === 400 || imageResponse.status === 403) {
        console.log('   May require billing or different access')
      }
      console.log('   Details:', errorText.substring(0, 200))
    } else {
      const result = await imageResponse.json()

      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const imageSize = part.inlineData.data.length
            console.log('✅ IMAGE GENERATION WORKING!')
            console.log(`   Image size: ${(imageSize / 1024).toFixed(2)} KB (base64)`)
            console.log('   🎉 You can generate images with this API key!')

            // Save image
            const fs = require('fs')
            const path = require('path')
            const outputDir = path.join(process.cwd(), 'public', 'test-outputs')
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true })
            }

            const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
            const filepath = path.join(outputDir, `new-api-test-${Date.now()}.png`)
            fs.writeFileSync(filepath, imageBuffer)
            console.log(`   📸 Saved to: ${filepath}`)
            break
          }
        }
      }
    }

    // Test 4: Check Imagen 4 access
    console.log('\n' + '='.repeat(60))
    console.log('\n🖼️  Step 4: Testing Imagen 4 access...\n')

    const imagenResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: "A professional product photo of a blue coffee mug on white background"
          }],
          parameters: {
            sampleCount: 1
          }
        })
      }
    )

    if (!imagenResponse.ok) {
      const errorText = await imagenResponse.text()
      console.log(`⚠️  Imagen 4 status: ${imagenResponse.status}`)

      if (imagenResponse.status === 400 && errorText.includes('billed')) {
        console.log('   Requires billing enabled')
      } else {
        console.log('   Details:', errorText.substring(0, 200))
      }
    } else {
      const result = await imagenResponse.json()

      if (result.predictions?.[0]?.bytesBase64Encoded) {
        const imageBuffer = Buffer.from(result.predictions[0].bytesBase64Encoded, 'base64')
        console.log('✅ IMAGEN 4 WORKING!')
        console.log(`   Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)
        console.log('   🎉 Professional image generation available!')

        // Save image
        const fs = require('fs')
        const path = require('path')
        const outputDir = path.join(process.cwd(), 'public', 'test-outputs')
        const filepath = path.join(outputDir, `imagen4-test-${Date.now()}.png`)
        fs.writeFileSync(filepath, imageBuffer)
        console.log(`   📸 Saved to: ${filepath}`)
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ API KEY TEST COMPLETE')
    console.log('='.repeat(60))
    console.log('\nYour new API key:', GEMINI_API_KEY)
    console.log('\n✅ Check public/test-outputs/ folder for any generated images!')

  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

testNewAPIKey()
