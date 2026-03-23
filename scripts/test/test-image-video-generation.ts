import fs from 'fs/promises'
import path from 'path'

const GEMINI_API_KEY = "AIzaSyDZMDF3VRfGs2l-c1MAwkZ5VgoksSq31fA"

async function testImageAndVideoGeneration() {
  console.log('🎨 Testing Image & Video Generation Models...\n')

  // Create output directory
  const outputDir = path.join(process.cwd(), 'public', 'test-outputs')
  await fs.mkdir(outputDir, { recursive: true })
  console.log('📁 Output directory:', outputDir, '\n')

  // Test 1: Imagen models (various versions)
  const imagenModels = [
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-ultra-generate-001',
  ]

  console.log('='.repeat(60))
  console.log('🖼️  TESTING IMAGE GENERATION (Imagen 4)\n')

  for (const modelName of imagenModels) {
    console.log(`\n📦 Testing: ${modelName}`)

    try {
      // Imagen uses the 'predict' method, not 'generateContent'
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{
              prompt: "A professional product photo of a red coffee mug on a white background, high quality, Amazon listing style"
            }],
            parameters: {
              sampleCount: 1
            }
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`   ❌ Error ${response.status}: ${response.statusText}`)

        if (response.status === 403) {
          console.log('   ⚠️  Access denied - may require billing enabled')
        } else if (response.status === 429) {
          console.log('   ⚠️  Rate limit exceeded')
        } else if (response.status === 400) {
          console.log('   ⚠️  Invalid request format')
        }
        console.log('   Details:', errorText.substring(0, 300))
        continue
      }

      const result = await response.json()
      console.log('   ✅ API Response received!')

      // Extract image data
      if (result.predictions && result.predictions.length > 0) {
        const prediction = result.predictions[0]

        if (prediction.bytesBase64Encoded) {
          // Save the image
          const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64')
          const filename = `${modelName.replace(/\./g, '-')}_output.png`
          const filepath = path.join(outputDir, filename)

          await fs.writeFile(filepath, imageBuffer)

          console.log(`   ✅ IMAGE GENERATED SUCCESSFULLY!`)
          console.log(`   📸 Saved to: public/test-outputs/${filename}`)
          console.log(`   📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)
          console.log(`   🎉 THIS MODEL IS WORKING!`)
        } else {
          console.log('   ⚠️  Response structure:', JSON.stringify(result).substring(0, 200))
        }
      } else {
        console.log('   ⚠️  No predictions in response')
        console.log('   Response:', JSON.stringify(result).substring(0, 200))
      }

    } catch (error: any) {
      console.log(`   ❌ Error:`, error.message)
    }
  }

  // Test 2: Gemini 2.5 Flash Image (Text-to-Image)
  console.log('\n' + '='.repeat(60))
  console.log('🎨 TESTING GEMINI FLASH IMAGE GENERATION\n')

  const flashImageModels = [
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'gemini-3-pro-image-preview'
  ]

  for (const modelName of flashImageModels) {
    console.log(`\n📦 Testing: ${modelName}`)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Generate an image: A simple blue ceramic vase on a white background, professional product photography"
              }]
            }]
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`   ❌ Error ${response.status}: ${response.statusText}`)
        if (response.status === 429) {
          console.log('   ⚠️  Rate limit - try again later')
        }
        continue
      }

      const result = await response.json()

      // Check for image in response
      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
            const filename = `${modelName.replace(/\./g, '-')}_output.png`
            const filepath = path.join(outputDir, filename)

            await fs.writeFile(filepath, imageBuffer)

            console.log(`   ✅ IMAGE GENERATED SUCCESSFULLY!`)
            console.log(`   📸 Saved to: public/test-outputs/${filename}`)
            console.log(`   📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)
            console.log(`   🎉 THIS MODEL IS WORKING!`)
            break
          }
        }
      }

    } catch (error: any) {
      console.log(`   ❌ Error:`, error.message)
    }
  }

  // Test 3: Veo Video Generation
  console.log('\n' + '='.repeat(60))
  console.log('🎬 TESTING VIDEO GENERATION (Veo)\n')

  const veoModels = [
    'veo-2.0-generate-001',
    'veo-3.0-fast-generate-001',
  ]

  for (const modelName of veoModels) {
    console.log(`\n📦 Testing: ${modelName}`)

    try {
      // Veo uses predictLongRunning - it's an async operation
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{
              prompt: "A coffee mug rotating slowly on a white background, 5 seconds"
            }],
            parameters: {
              sampleCount: 1
            }
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`   ❌ Error ${response.status}: ${response.statusText}`)

        if (response.status === 403) {
          console.log('   ⚠️  Access denied - video generation requires paid tier')
        } else if (response.status === 429) {
          console.log('   ⚠️  Rate limit exceeded')
        }
        console.log('   Details:', errorText.substring(0, 300))
        continue
      }

      const result = await response.json()
      console.log('   ✅ Video generation request accepted!')

      if (result.predictions) {
        console.log('   📹 Video is being generated (async operation)')
        console.log('   ⏳ Note: Video generation takes several minutes')
        console.log('   🎉 THIS MODEL IS ACCESSIBLE!')
      } else if (result.name) {
        // Long-running operation
        console.log('   ✅ Long-running operation started!')
        console.log('   Operation:', result.name)
        console.log('   📹 Video will be available after processing completes')
      }

    } catch (error: any) {
      console.log(`   ❌ Error:`, error.message)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))
  console.log('\n✅ Check the output directory for generated images:')
  console.log(`   📁 ${outputDir}`)
  console.log('\n🎨 Image Generation Models:')
  console.log('   - Imagen 4.0: Professional image generation (may require billing)')
  console.log('   - Gemini Flash Image: Fast image generation (free tier available)')
  console.log('\n🎬 Video Generation Models:')
  console.log('   - Veo 2.0/3.0: Video generation (typically requires paid tier)')
  console.log('\n💡 Recommendation:')
  console.log('   Use Imagen 4.0 or Gemini Flash Image for product photos')
}

testImageAndVideoGeneration()
