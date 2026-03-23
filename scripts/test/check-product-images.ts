import { prisma } from '../lib/prisma'

async function checkProductImages() {
  const productId = process.argv[2] || 'cmkuuxeri005ke0ew5uyb60ch'

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        sourceImages: {
          select: {
            id: true,
            variant: true,
            amazonImageUrl: true,
            localFilePath: true,
            createdAt: true
          },
          orderBy: { imageOrder: 'asc' }
        },
        images: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            status: true,
            version: true,
            createdAt: true,
            imageType: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!product) {
      console.log('Product not found')
      return
    }

    console.log('\n=== Product Info ===')
    console.log('ID:', productId)
    console.log('Title:', product.title)
    console.log('ASIN:', product.asin)
    console.log('Source Images:', product.sourceImages.length)
    console.log('Generated Images:', product.images.length)

    console.log('\n=== Source Images ===')
    let withS3 = 0
    let withoutS3 = 0
    product.sourceImages.forEach((img, idx) => {
      const hasS3 = img.localFilePath !== null
      if (hasS3) withS3++
      else withoutS3++

      console.log((idx + 1) + '. ' + img.variant)
      console.log('   Created:', img.createdAt)
      console.log('   S3 Path:', img.localFilePath || 'NULL (showing Amazon URL)')
      console.log('   Amazon:', img.amazonImageUrl)
    })
    console.log('\nSummary: ' + withS3 + ' on S3, ' + withoutS3 + ' using Amazon URL')

    console.log('\n=== Generated Images ===')
    product.images.forEach((img, idx) => {
      console.log((idx + 1) + '. ' + img.imageType.name + ' - v' + img.version)
      console.log('   Status:', img.status)
      console.log('   File:', img.fileName)
      console.log('   Path:', img.filePath)
      console.log('   Created:', img.createdAt)
    })

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkProductImages()
