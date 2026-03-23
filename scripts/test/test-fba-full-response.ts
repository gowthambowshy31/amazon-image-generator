import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

async function testFullResponse() {
  console.log('🔍 Testing FBA Inventory Full Response Structure...\n')

  const amazonSP = getAmazonSPClient()

  try {
    const queryParams: any = {
      marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
      granularityType: "Marketplace",
      granularityId: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
    }

    const response = await (amazonSP as any).client.callAPI({
      operation: "getInventorySummaries",
      endpoint: "fbaInventory",
      query: queryParams
    })

    console.log('📦 Full Response Structure:')
    console.log(JSON.stringify(response, null, 2))

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testFullResponse()
