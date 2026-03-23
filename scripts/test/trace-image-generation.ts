import { prisma } from '../lib/prisma'
import { generateImage } from '../lib/gemini'
import path from 'path'
import fs from 'fs/promises'

async function traceImageGeneration() {
  console.log('🔍 TRACING IMAGE GENERATION CALL\n')
  console.log('='.repeat(80))

  try {
    const productId = 'cmk2efv4o05avb0ewz6gehomn'

    // 1. Get product data
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        sourceImages: {
          orderBy: { imageOrder: 'asc' },
          take: 1
        }
      }
    })

    if (!product) {
      console.log('❌ Product not found')
      return
    }

    // 2. Get image type (Front View)
    const imageType = await prisma.imageType.findFirst({
      where: { name: 'Front View' }
    })

    if (!imageType) {
      console.log('❌ Image type not found')
      return
    }

    console.log('\n📦 STEP 1: PRODUCT INFORMATION')
    console.log('-'.repeat(80))
    console.log('Product ID:', product.id)
    console.log('Product Title:', product.title)
    console.log('Product ASIN:', product.asin)
    console.log('Number of source images:', product.sourceImages.length)

    // 3. Get the source image
    const sourceImage = product.sourceImages[0]
    if (!sourceImage) {
      console.log('❌ No source images available')
      return
    }

    const sourceImagePath = path.join(process.cwd(), 'public', sourceImage.localFilePath)

    console.log('\n📷 STEP 2: SOURCE IMAGE (INPUT TO GEMINI)')
    console.log('-'.repeat(80))
    console.log('Source Image ID:', sourceImage.id)
    console.log('Source Image Variant:', sourceImage.variant)
    console.log('Source Image Dimensions:', `${sourceImage.width}x${sourceImage.height}`)
    console.log('Source Image Local Path:', sourceImage.localFilePath)
    console.log('Source Image Amazon URL:', sourceImage.amazonImageUrl)
    console.log('Full File Path:', sourceImagePath)

    // Check if file exists
    try {
      const stats = await fs.stat(sourceImagePath)
      console.log('File Size:', `${Math.round(stats.size / 1024)}KB`)
      console.log('File Exists:', '✅ YES')
    } catch (err) {
      console.log('File Exists:', '❌ NO')
    }

    // 4. Build the prompt
    let prompt = imageType.defaultPrompt
    prompt = prompt
      .replace(/\{product_name\}/g, product.title)
      .replace(/\{product_title\}/g, product.title)
      .replace(/\{category\}/g, product.category || '')
      .replace(/\{asin\}/g, product.asin || '')

    console.log('\n💬 STEP 3: PROMPT (SENT TO GEMINI)')
    console.log('-'.repeat(80))
    console.log('Image Type:', imageType.name)
    console.log('Image Type Description:', imageType.description)
    console.log('\nDefault Prompt Template:')
    console.log(imageType.defaultPrompt)
    console.log('\nFinal Prompt (after variable substitution):')
    console.log(prompt)

    // 5. Generate the image
    const timestamp = Date.now()
    const fileName = `trace_test_${timestamp}.png`
    const outputPath = path.join(process.cwd(), 'public', 'uploads', fileName)

    console.log('\n⚙️ STEP 4: CALLING GEMINI API')
    console.log('-'.repeat(80))
    console.log('Generating image...')

    const result = await generateImage({
      prompt: prompt,
      sourceImagePath: sourceImagePath,
      outputPath: outputPath,
      width: 1024,
      height: 1024
    })

    console.log('\n🎨 STEP 5: GENERATED IMAGE (OUTPUT FROM GEMINI)')
    console.log('-'.repeat(80))
    if (result.success) {
      console.log('Generation Status:', '✅ SUCCESS')
      console.log('Output File Name:', result.fileName)
      console.log('Output File Path:', result.filePath)
      console.log('Output Dimensions:', `${result.width}x${result.height}`)
      console.log('Output File Size:', `${Math.round((result.fileSize || 0) / 1024)}KB`)
      console.log('\nView in Browser:')
      console.log(`  Source Image: http://localhost:3002${sourceImage.localFilePath}`)
      console.log(`  Generated Image: http://localhost:3002/uploads/${result.fileName}`)
    } else {
      console.log('Generation Status:', '❌ FAILED')
      console.log('Error:', result.error)
    }

    console.log('\n' + '='.repeat(80))
    console.log('\n📊 SUMMARY')
    console.log('-'.repeat(80))
    console.log('INPUT:')
    console.log(`  - Product: ${product.title}`)
    console.log(`  - Prompt: "${prompt}"`)
    console.log(`  - Source: ${sourceImage.localFilePath}`)
    console.log('\nOUTPUT:')
    console.log(`  - File: /uploads/${result.fileName}`)
    console.log(`  - Size: ${result.width}x${result.height}`)
    console.log('\n🔬 CURRENT IMPLEMENTATION NOTE:')
    console.log('The generateImage() function is currently using Sharp (image processing library)')
    console.log('to resize and process the source image. It does NOT actually call Gemini AI API')
    console.log('for image generation. The prompt is stored but not used in actual generation.')
    console.log('\nWhat it actually does:')
    console.log('1. Reads the source image from Amazon')
    console.log('2. Resizes it to 1024x1024 using Sharp')
    console.log('3. Saves it as a new PNG file')
    console.log('\nFor true AI generation, you would need to integrate with an actual image')
    console.log('generation API like DALL-E, Midjourney, or Stable Diffusion.')

    await prisma.$disconnect()
  } catch (error) {
    console.error('\n❌ ERROR:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

traceImageGeneration()
