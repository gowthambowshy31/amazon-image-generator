import { prisma } from '../lib/prisma'

async function checkProductData() {
  try {
    const product = await prisma.product.findUnique({
      where: { id: 'cmk4xpg8v0001ewqopmi9z1pd' },
      include: {
        sourceImages: true,
        images: true
      }
    })

    if (!product) {
      console.log('❌ Product not found')
      return
    }

    console.log('📦 Product Information:')
    console.log('='.repeat(60))
    console.log('ID:', product.id)
    console.log('Title:', product.title)
    console.log('ASIN:', product.asin)
    console.log('Category:', product.category)
    console.log('Status:', product.status)
    console.log('\n📊 Metadata:')
    console.log(JSON.stringify(product.metadata, null, 2))
    console.log('\n🖼️  Source Images:', product.sourceImages.length)
    console.log('🎨 Generated Images:', product.images.length)
    console.log('\n' + '='.repeat(60))

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkProductData()
