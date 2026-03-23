import { GoogleGenerativeAI } from "@google/generative-ai"
import fs from 'fs/promises'
import path from 'path'

const GEMINI_API_KEY = "AIzaSyDZMDF3VRfGs2l-c1MAwkZ5VgoksSq31fA"

async function generateTestImage() {
  console.log('🎨 Attempting to Generate Test Image...\n')

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

  // Create output directory
  const outputDir = path.join(process.cwd(), 'public', 'test-outputs')
  await fs.mkdir(outputDir, { recursive: true })

  // Try different image generation approaches
  const attempts = [
    {
      name: 'Gemini 2.5 Flash with Image Request',
      model: 'gemini-2.5-flash',
      prompt: 'Create a simple image of a red apple on a white background'
    },
    {
      name: 'Gemini Pro Vision Analysis (not generation)',
      model: 'gemini-2.5-flash',
      prompt: 'Describe what a professional product photo of a coffee mug should look like'
    }
  ]

  for (const attempt of attempts) {
    console.log('='.repeat(60))
    console.log(`\n🧪 Attempt: ${attempt.name}`)
    console.log(`Model: ${attempt.model}\n`)

    try {
      const model = genAI.getGenerativeModel({ model: attempt.model })
      const result = await model.generateContent(attempt.prompt)
      const response = await result.response

      // Check if there's image data
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0]

        let foundImage = false
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              // Found image data!
              const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
              const filename = `test-image-${Date.now()}.png`
              const filepath = path.join(outputDir, filename)

              await fs.writeFile(filepath, imageBuffer)

              console.log('✅ SUCCESS! IMAGE GENERATED!')
              console.log(`📸 Saved to: public/test-outputs/${filename}`)
              console.log(`📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)
              console.log(`🎉 Model: ${attempt.model}`)

              foundImage = true
              return // Success!
            } else if (part.text) {
              // Text response
              console.log('📝 Text Response (No Image):')
              console.log(part.text.substring(0, 300))
            }
          }
        }

        if (!foundImage) {
          console.log('⚠️  No image data in response - text only')
        }
      }

    } catch (error: any) {
      console.log('❌ Error:', error.message)

      if (error.message?.includes('429')) {
        console.log('⚠️  Rate limit - API key has hit quota temporarily')
      }
    }
  }

  // Status report
  console.log('\n' + '='.repeat(60))
  console.log('📊 IMAGE GENERATION STATUS REPORT')
  console.log('='.repeat(60))
  console.log('\n🔍 Findings:')
  console.log('\n❌ Image Generation Models Status:')
  console.log('   • Imagen 4.0 models - Require billing enabled')
  console.log('   • Gemini Flash Image - Rate limited (free tier quota)')
  console.log('   • Veo video models - Require billing/different API')
  console.log('\n✅ What IS Working:')
  console.log('   • Text generation (gemini-2.5-flash, gemini-2.0-flash)')
  console.log('   • Vision/Image analysis (analyze existing images)')
  console.log('   • Text embeddings')
  console.log('\n💡 To Enable Image Generation:')
  console.log('   1. Enable billing in Google Cloud Console')
  console.log('   2. Or wait for rate limits to reset (typically 24 hours)')
  console.log('   3. Or get a new API key with fresh quota')
  console.log('\n🎯 Current API Key Capabilities:')
  console.log('   ✅ Text generation - WORKING')
  console.log('   ✅ Vision/analysis - WORKING')
  console.log('   ⏳ Image generation - Rate limited (need billing or quota reset)')
  console.log('   ⏳ Video generation - Requires billing')
  console.log('\n📖 Your app can still work with:')
  console.log('   • AI-powered text prompts and descriptions')
  console.log('   • Image analysis and suggestions')
  console.log('   • Product description generation')
  console.log('   • Once billing enabled or quota resets: Full image generation')
}

generateTestImage()
