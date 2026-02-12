// @ts-ignore - amazon-sp-api types are not fully compatible
import SellingPartnerAPI from "amazon-sp-api"

interface AmazonCredentials {
  region: string
  refresh_token: string
  client_id: string
  client_secret: string
  marketplace_id: string
}

interface AmazonProductImage {
  variant: string
  link: string
  height: number
  width: number
}

interface AmazonProduct {
  asin: string
  title: string
  brand?: string
  manufacturer?: string
  productType?: string
  images: AmazonProductImage[]
  attributes?: Record<string, any>
}

// Types for updating listing images
export interface ImageSlotMapping {
  slot: 'MAIN' | 'PT01' | 'PT02' | 'PT03' | 'PT04' | 'PT05' | 'PT06' | 'PT07' | 'PT08'
  imageUrl: string
}

export interface UpdateListingImagesParams {
  sku: string
  images: ImageSlotMapping[]
  productType: string
}

export interface UpdateListingImagesResult {
  success: boolean
  status: string
  submissionId?: string
  issues?: Array<{ code: string; message: string; severity: string }>
  error?: string
}

export class AmazonSPService {
  private client: any

  constructor(credentials?: AmazonCredentials) {
    const creds = credentials || {
      region: process.env.AMAZON_REGION || "na",
      refresh_token: process.env.AMAZON_REFRESH_TOKEN || "",
      client_id: process.env.AMAZON_CLIENT_ID || "",
      client_secret: process.env.AMAZON_CLIENT_SECRET || "",
      marketplace_id: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
    }

    // @ts-ignore - constructor type issue
    this.client = new SellingPartnerAPI({
      region: creds.region,
      refresh_token: creds.refresh_token,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: creds.client_id,
        SELLING_PARTNER_APP_CLIENT_SECRET: creds.client_secret
      },
      options: {
        auto_request_tokens: true,
        use_sandbox: false
      }
    })
  }

  /**
   * Fetch product details and images from Amazon Catalog API
   */
  async getProductByASIN(asin: string): Promise<AmazonProduct | null> {
    try {
      const response = await this.client.callAPI({
        operation: "getCatalogItem",
        endpoint: "catalogItems",
        path: {
          asin: asin
        },
        query: {
          marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
          includedData: "images,attributes,productTypes,summaries"
        }
      })

      if (!response || !response.asin) {
        return null
      }

      // Extract product information
      const productData = response
      const images: AmazonProductImage[] = []

      // Parse images from the response
      if (productData.images && Array.isArray(productData.images)) {
        for (const imageGroup of productData.images) {
          if (imageGroup.images && Array.isArray(imageGroup.images)) {
            for (const img of imageGroup.images) {
              images.push({
                variant: img.variant || "MAIN",
                link: img.link,
                height: img.height || 0,
                width: img.width || 0
              })
            }
          }
        }
      }

      // Extract title from summaries
      let title = asin
      if (productData.summaries && Array.isArray(productData.summaries) && productData.summaries.length > 0) {
        title = productData.summaries[0].itemName || asin
      }

      // Extract attributes
      let brand: string | undefined
      let manufacturer: string | undefined
      let productType: string | undefined

      if (productData.attributes) {
        brand = productData.attributes.brand?.[0]?.value
        manufacturer = productData.attributes.manufacturer?.[0]?.value
      }

      if (productData.productTypes && Array.isArray(productData.productTypes) && productData.productTypes.length > 0) {
        productType = productData.productTypes[0].productType
      }

      return {
        asin: productData.asin,
        title,
        brand,
        manufacturer,
        productType,
        images,
        attributes: productData.attributes || {}
      }
    } catch (error) {
      console.error("Error fetching product from Amazon:", error)
      throw error
    }
  }

  /**
   * Search for products in your catalog
   */
  async searchCatalog(keywords: string, limit: number = 10): Promise<AmazonProduct[]> {
    try {
      const response = await this.client.callAPI({
        operation: "searchCatalogItems",
        endpoint: "catalogItems",
        query: {
          marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
          keywords: keywords,
          includedData: "images,summaries",
          pageSize: limit
        }
      })

      if (!response || !response.items) {
        return []
      }

      const products: AmazonProduct[] = []

      for (const item of response.items) {
        const images: AmazonProductImage[] = []

        if (item.images && Array.isArray(item.images)) {
          for (const imageGroup of item.images) {
            if (imageGroup.images && Array.isArray(imageGroup.images)) {
              for (const img of imageGroup.images) {
                images.push({
                  variant: imageGroup.variant || "MAIN",
                  link: img.link,
                  height: img.height || 0,
                  width: img.width || 0
                })
              }
            }
          }
        }

        let title = item.asin
        if (item.summaries && Array.isArray(item.summaries) && item.summaries.length > 0) {
          title = item.summaries[0].itemName || item.asin
        }

        products.push({
          asin: item.asin,
          title,
          images,
          attributes: item.attributes || {}
        })
      }

      return products
    } catch (error) {
      console.error("Error searching Amazon catalog:", error)
      throw error
    }
  }

  /**
   * Get all FBA inventory items from your seller account
   */
  async getFBAInventory(): Promise<string[]> {
    try {
      const asins: string[] = []
      let nextToken: string | undefined = undefined

      do {
        const queryParams: any = {
          marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
          granularityType: "Marketplace",
          granularityId: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
        }

        if (nextToken) {
          queryParams.nextToken = nextToken
        }

        const response = await this.client.callAPI({
          operation: "getInventorySummaries",
          endpoint: "fbaInventory",
          query: queryParams
        })

        if (response && response.inventorySummaries) {
          for (const item of response.inventorySummaries) {
            if (item.asin) {
              asins.push(item.asin)
            }
          }
        }

        // nextToken is at root level, not inside pagination object
        nextToken = response?.nextToken
      } while (nextToken)

      return asins
    } catch (error) {
      console.error("Error fetching FBA inventory:", error)
      throw error
    }
  }

  /**
   * Get FBA inventory items with quantity information
   * Returns items with their ASIN and available quantity
   */
  async getFBAInventoryWithQuantity(includeZeroQuantity: boolean = true): Promise<Array<{ asin: string; quantity: number; productName?: string }>> {
    try {
      const items: Array<{ asin: string; quantity: number; productName?: string }> = []
      let nextToken: string | undefined = undefined

      do {
        const queryParams: any = {
          marketplaceIds: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER",
          granularityType: "Marketplace",
          granularityId: process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
        }

        if (nextToken) {
          queryParams.nextToken = nextToken
        }

        const response = await this.client.callAPI({
          operation: "getInventorySummaries",
          endpoint: "fbaInventory",
          query: queryParams
        })

        if (response && response.inventorySummaries) {
          for (const item of response.inventorySummaries) {
            if (item.asin) {
              const quantity = item.totalQuantity || 0

              // Filter based on includeZeroQuantity flag
              if (includeZeroQuantity || quantity > 0) {
                items.push({
                  asin: item.asin,
                  quantity: quantity,
                  productName: item.productName
                })
              }
            }
          }
        }

        // nextToken is at root level, not inside pagination object
        nextToken = response?.nextToken
      } while (nextToken)

      return items
    } catch (error) {
      console.error("Error fetching FBA inventory with quantity:", error)
      throw error
    }
  }

  /**
   * Get the Seller SKU for a given ASIN by searching FBA inventory
   * The Seller SKU is required by the Listings API (not the ASIN)
   */
  async getSellerSKUByASIN(asin: string): Promise<string | null> {
    try {
      const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"
      let nextToken: string | undefined = undefined

      do {
        const queryParams: any = {
          marketplaceIds: marketplaceId,
          granularityType: "Marketplace",
          granularityId: marketplaceId
        }

        if (nextToken) {
          queryParams.nextToken = nextToken
        }

        const response = await this.client.callAPI({
          operation: "getInventorySummaries",
          endpoint: "fbaInventory",
          query: queryParams
        })

        if (response && response.inventorySummaries) {
          for (const item of response.inventorySummaries) {
            if (item.asin === asin && item.sellerSku) {
              console.log(`Found SKU "${item.sellerSku}" for ASIN "${asin}"`)
              return item.sellerSku
            }
          }
        }

        nextToken = response?.nextToken
      } while (nextToken)

      console.warn(`No SKU found in FBA inventory for ASIN "${asin}"`)
      return null
    } catch (error) {
      console.error("Error fetching SKU by ASIN:", error)
      return null
    }
  }

  /**
   * Update product images on Amazon listing using Listings Items API
   * Uses PATCH operation to update specific image attributes
   *
   * Note: Images must be hosted at a publicly accessible URL or in an S3 bucket
   * with proper permissions granted to Amazon's Media Download Role
   */
  async updateListingImages(params: UpdateListingImagesParams): Promise<UpdateListingImagesResult> {
    try {
      const { sku, images, productType } = params
      const sellerId = process.env.AMAZON_SELLER_ID
      const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"

      if (!sellerId) {
        return {
          success: false,
          status: 'ERROR',
          error: 'AMAZON_SELLER_ID environment variable is not configured'
        }
      }

      // Build the patches array for image updates
      // Amazon uses different attribute names for each image slot
      const patches = images.map(({ slot, imageUrl }) => {
        let attributeName: string

        if (slot === 'MAIN') {
          attributeName = 'main_product_image_locator'
        } else {
          // PT01 -> other_product_image_locator_1, PT02 -> other_product_image_locator_2, etc.
          const slotNumber = parseInt(slot.replace('PT0', '').replace('PT', ''))
          attributeName = `other_product_image_locator_${slotNumber}`
        }

        return {
          op: 'replace',
          path: `/attributes/${attributeName}`,
          value: [
            {
              media_location: imageUrl,
              marketplace_id: marketplaceId
            }
          ]
        }
      })

      console.log(`Updating listing images for SKU: ${sku}, Seller: ${sellerId}`)
      console.log(`Patches:`, JSON.stringify(patches, null, 2))

      const response = await this.client.callAPI({
        operation: "patchListingsItem",
        endpoint: "listingsItems",
        path: {
          sellerId: sellerId,
          sku: sku
        },
        query: {
          marketplaceIds: marketplaceId
        },
        body: {
          productType: productType,
          patches: patches
        }
      })

      console.log(`Amazon API Response:`, JSON.stringify(response, null, 2))

      // Check response for success/failure
      // Amazon returns status: "ACCEPTED" for successful submissions
      if (response?.status === 'ACCEPTED') {
        return {
          success: true,
          status: 'ACCEPTED',
          submissionId: response.submissionId,
          issues: response.issues || []
        }
      }

      // Handle other statuses
      return {
        success: false,
        status: response?.status || 'UNKNOWN',
        issues: response?.issues || [],
        error: `Listing update returned status: ${response?.status || 'UNKNOWN'}`
      }
    } catch (error) {
      console.error("Error updating listing images:", error)

      // Extract meaningful error message
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error)
      }

      return {
        success: false,
        status: 'ERROR',
        error: errorMessage
      }
    }
  }

  /**
   * Get listing item details including current images
   * Useful for checking current state before updating
   */
  async getListingItem(sku: string): Promise<any> {
    try {
      const sellerId = process.env.AMAZON_SELLER_ID
      const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || "ATVPDKIKX0DER"

      if (!sellerId) {
        throw new Error('AMAZON_SELLER_ID environment variable is not configured')
      }

      const response = await this.client.callAPI({
        operation: "getListingsItem",
        endpoint: "listingsItems",
        path: {
          sellerId: sellerId,
          sku: sku
        },
        query: {
          marketplaceIds: marketplaceId,
          includedData: "summaries,attributes,issues"
        }
      })

      return response
    } catch (error) {
      console.error("Error getting listing item:", error)
      throw error
    }
  }
}

// Singleton instance
let amazonSPInstance: AmazonSPService | null = null

export function getAmazonSPClient(): AmazonSPService {
  if (!amazonSPInstance) {
    amazonSPInstance = new AmazonSPService()
  }
  return amazonSPInstance
}
