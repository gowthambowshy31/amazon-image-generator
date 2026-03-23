import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

async function testFBAWithQuantity() {
  console.log('🔍 Testing FBA Inventory API to check quantity data...\n')

  const amazonSP = getAmazonSPClient()

  try {
    // Call the API directly to see the full response
    const response = await (amazonSP as any).client.callAPI({
      operation: "getInventorySummaries",
      endpoint: "fbaInventory",
      query: {
        marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
        granularityType: "Marketplace",
        granularityId: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
      }
    })

    console.log('📦 Full API Response Structure:')
    console.log(JSON.stringify(response, null, 2))

    if (response && response.inventorySummaries) {
      console.log(`\n✅ Found ${response.inventorySummaries.length} items in first page`)

      // Show first 5 items with their structure
      console.log('\n📋 Sample Items (first 5):')
      response.inventorySummaries.slice(0, 5).forEach((item: any, idx: number) => {
        console.log(`\n${idx + 1}. ASIN: ${item.asin}`)
        console.log(`   FNSKU: ${item.fnSku || 'N/A'}`)
        console.log(`   Condition: ${item.condition || 'N/A'}`)
        console.log(`   Total Quantity: ${item.totalQuantity || 0}`)

        if (item.inventoryDetails) {
          console.log('   Inventory Details:')
          console.log(`     - Fulfillable: ${item.inventoryDetails.fulfillableQuantity || 0}`)
          console.log(`     - Inbound Working: ${item.inventoryDetails.inboundWorkingQuantity || 0}`)
          console.log(`     - Inbound Shipped: ${item.inventoryDetails.inboundShippedQuantity || 0}`)
          console.log(`     - Inbound Receiving: ${item.inventoryDetails.inboundReceivingQuantity || 0}`)
          console.log(`     - Reserved: ${item.inventoryDetails.reservedQuantity || 0}`)
          console.log(`     - Unfulfillable: ${item.inventoryDetails.unfulfillableQuantity || 0}`)
        }

        console.log('   Full Item:', JSON.stringify(item, null, 2))
      })

      // Count items with quantity > 0
      const itemsWithStock = response.inventorySummaries.filter((item: any) => {
        const totalQty = item.totalQuantity || 0
        const fulfillableQty = item.inventoryDetails?.fulfillableQuantity || 0
        return totalQty > 0 || fulfillableQty > 0
      })

      console.log(`\n📊 Summary:`)
      console.log(`   Total items: ${response.inventorySummaries.length}`)
      console.log(`   Items with stock (totalQuantity > 0 or fulfillableQuantity > 0): ${itemsWithStock.length}`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testFBAWithQuantity()
