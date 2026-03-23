import { generateImage } from '../lib/gemini'
import path from 'path'

async function testGeminiImagen() {
  console.log('🎨 TESTING GEMINI IMAGEN 3 API\n')
  console.log('='.repeat(80))

  const tests = [
    {
      name: 'Test 1: Text-to-Image (No source)',
      prompt: 'A professional product photo of a luxury diamond ring on a white background, studio lighting, high resolution',
      sourceImagePath: undefined,
      productSize: 'medium' as const
    },
    {
      name: 'Test 2: Image-to-Image with SMALL product size',
      prompt: 'Create a professional product image of Colgate toothpaste with clean white background',
      sourceImagePath: path.join(
        process.cwd(),
        'public',
        'uploads',
        'source-images',
        'cmk2efv4o05avb0ewz6gehomn',
        'MAIN_0_1dc7eba2.jpg'
      ),
      productSize: 'small' as const
    },
    {
      name: 'Test 3: Image-to-Image with MEDIUM product size',
      prompt: 'Create a professional product image of Colgate toothpaste with clean white background',
      sourceImagePath: path.join(
        process.cwd(),
        'public',
        'uploads',
        'source-images',
        'cmk2efv4o05avb0ewz6gehomn',
        'MAIN_0_1dc7eba2.jpg'
      ),
      productSize: 'medium' as const
    },
    {
      name: 'Test 4: Image-to-Image with LARGE product size',
      prompt: 'Create a professional product image of Colgate toothpaste with clean white background',
      sourceImagePath: path.join(
        process.cwd(),
        'public',
        'uploads',
        'source-images',
        'cmk2efv4o05avb0ewz6gehomn',
        'MAIN_0_1dc7eba2.jpg'
      ),
      productSize: 'large' as const
    }
  ]

  const results: any[] = []

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i]
    console.log(`\n${'='.repeat(80)}`)
    console.log(`\n${test.name}`)
    console.log('-'.repeat(80))
    console.log('Prompt:', test.prompt)
    console.log('Product Size:', test.productSize)
    console.log('Has Source Image:', !!test.sourceImagePath)

    const outputPath = path.join(
      process.cwd(),
      'public',
      'uploads',
      `gemini_test_${test.productSize}_${Date.now()}.png`
    )

    console.log('\n⏳ Generating...')

    try {
      const result = await generateImage({
        prompt: test.prompt,
        sourceImagePath: test.sourceImagePath,
        outputPath: outputPath,
        width: 1024,
        height: 1024,
        productSize: test.productSize
      })

      if (result.success) {
        console.log('\n✅ SUCCESS')
        console.log('File:', result.fileName)
        console.log('Size:', `${result.width}x${result.height}`)
        console.log('File Size:', `${Math.round((result.fileSize || 0) / 1024)}KB`)
        console.log('URL:', `http://localhost:3002/uploads/${result.fileName}`)

        results.push({
          test: test.name,
          status: 'SUCCESS',
          file: result.fileName,
          url: `http://localhost:3002/uploads/${result.fileName}`
        })
      } else {
        console.log('\n❌ FAILED')
        console.log('Error:', result.error)

        results.push({
          test: test.name,
          status: 'FAILED',
          error: result.error
        })
      }
    } catch (error) {
      console.log('\n❌ EXCEPTION')
      console.error(error)

      results.push({
        test: test.name,
        status: 'EXCEPTION',
        error: error instanceof Error ? error.message : String(error)
      })
    }

    // Wait a bit between tests to avoid rate limiting
    if (i < tests.length - 1) {
      console.log('\n⏸️ Waiting 2 seconds before next test...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('\n📊 TEST SUMMARY')
  console.log('='.repeat(80))

  results.forEach((result, idx) => {
    console.log(`\n${idx + 1}. ${result.test}`)
    console.log(`   Status: ${result.status}`)
    if (result.url) {
      console.log(`   View: ${result.url}`)
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`)
    }
  })

  const successCount = results.filter(r => r.status === 'SUCCESS').length
  const failCount = results.filter(r => r.status !== 'SUCCESS').length

  console.log(`\n${'='.repeat(80)}`)
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failCount}`)

  if (successCount > 0) {
    console.log(`\n🎉 Generated images are available at:`)
    results
      .filter(r => r.url)
      .forEach(r => console.log(`   ${r.url}`))
  }

  console.log('\n' + '='.repeat(80))
  console.log('\n💡 NOTE:')
  console.log('If Gemini Imagen 3 is not available in your region or tier,')
  console.log('the code will automatically fall back to Sharp image processing.')
  console.log('Check the logs above to see which method was used.')
}

testGeminiImagen()
