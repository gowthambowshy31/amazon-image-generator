const productId = 'cmk2efv4o05avb0ewz6gehomn'

fetch(`http://localhost:3002/api/products/${productId}`)
  .then(res => res.json())
  .then(data => {
    console.log('=== Product API Response ===')
    console.log('Product ID:', data.id)
    console.log('Product Title:', data.title)
    console.log('Number of source images:', data.sourceImages?.length || 0)
    console.log('Number of generated images:', data.images?.length || 0)

    if (data.images && data.images.length > 0) {
      console.log('\n=== Generated Images ===')
      data.images.forEach((img, idx) => {
        console.log(`\n${idx + 1}. ${img.imageType?.name || 'Unknown'}`)
        console.log('   Status:', img.status)
        console.log('   Version:', img.version)
        console.log('   File Name:', img.fileName)
        console.log('   Has imageType:', !!img.imageType)
      })
    } else {
      console.log('\n⚠️ No generated images found in API response')
    }
  })
  .catch(err => {
    console.error('Error:', err.message)
  })
