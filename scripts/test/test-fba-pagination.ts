import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

async function testFBAPagination() {
  console.log('🔍 Testing FBA Inventory Pagination...\n')

  const amazonSP = getAmazonSPClient()

  try {
    console.log('Testing getFBAInventory() method with pagination fix...\n')

    const asins = await amazonSP.getFBAInventory()

    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 Results:`)
    console.log(`   Total ASINs fetched: ${asins.length}`)
    console.log(`${'='.repeat(60)}`)

    console.log(`\n✅ All ASINs:`)
    asins.forEach((asin, idx) => {
      console.log(`   ${idx + 1}. ${asin}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testFBAPagination()
