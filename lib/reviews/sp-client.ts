// eslint-disable-next-line @typescript-eslint/no-require-imports
const SellingPartner = require("amazon-sp-api")
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

export interface SolicitationResult {
  success: boolean
  httpStatusCode: number
  requestId: string | null
  rateLimitValue: string | null
  responseBody: string
  responseHeaders: string
  errorCode?: string
  errorMessage?: string
  notEligible?: boolean
}

export class ReviewsSPClient {
  private client: any
  private marketplaceId: string

  constructor(opts: {
    region: string
    refreshToken: string
    clientId: string
    clientSecret: string
    marketplaceId: string
  }) {
    this.marketplaceId = opts.marketplaceId
    this.client = new SellingPartner({
      region: opts.region || "na",
      refresh_token: opts.refreshToken,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: opts.clientId,
        SELLING_PARTNER_APP_CLIENT_SECRET: opts.clientSecret,
      },
      options: {
        auto_request_tokens: true,
        auto_request_throttled: true,
        version_fallback: true,
      },
    })
  }

  async getOrders(createdAfter: string, nextToken?: string): Promise<any> {
    const query: Record<string, any> = {
      MarketplaceIds: [this.marketplaceId],
      CreatedAfter: createdAfter,
      MaxResultsPerPage: 50,
    }
    if (nextToken) query.NextToken = nextToken
    return this.client.callAPI({ operation: "getOrders", endpoint: "orders", query })
  }

  async checkEligibility(orderId: string): Promise<{ actions: { name: string }[]; errors?: any[] }> {
    const response: any = await this.client.callAPI({
      operation: "getSolicitationActionsForOrder",
      endpoint: "solicitations",
      path: { amazonOrderId: orderId },
      query: { marketplaceIds: [this.marketplaceId] },
    })
    const embedded = response._embedded as { actions?: { name: string }[] } | undefined
    const actions = embedded?.actions || response.actions || []
    return { ...response, actions }
  }

  async sendReviewRequest(orderId: string): Promise<SolicitationResult> {
    try {
      const eligibility = await this.checkEligibility(orderId)
      if (eligibility.errors && eligibility.errors.length > 0) {
        return {
          success: false,
          httpStatusCode: 400,
          requestId: null,
          rateLimitValue: null,
          responseBody: JSON.stringify(eligibility.errors),
          responseHeaders: "{}",
          errorCode: eligibility.errors[0].code,
          errorMessage: eligibility.errors[0].message,
        }
      }

      const hasAction = eligibility.actions?.some((a) => a.name === "productReviewAndSellerFeedback")
      if (!hasAction) {
        return {
          success: false,
          httpStatusCode: 0,
          requestId: null,
          rateLimitValue: null,
          responseBody: JSON.stringify({ message: "Order not eligible for review solicitation" }),
          responseHeaders: "{}",
          notEligible: true,
          errorCode: "NOT_ELIGIBLE",
          errorMessage: "Product review solicitation is not available for this order",
        }
      }

      const rawResponse: any = await this.client.callAPI({
        operation: "createProductReviewAndSellerFeedbackSolicitation",
        endpoint: "solicitations",
        path: { amazonOrderId: orderId },
        query: { marketplaceIds: [this.marketplaceId] },
        options: { raw_result: true },
      })

      const statusCode = rawResponse?.statusCode || 201
      const headers = rawResponse?.headers || {}
      return {
        success: statusCode >= 200 && statusCode < 300,
        httpStatusCode: statusCode,
        requestId: headers["x-amzn-requestid"] || null,
        rateLimitValue: headers["x-amzn-ratelimit-limit"] || null,
        responseBody: typeof rawResponse?.body === "string" ? rawResponse.body : JSON.stringify(rawResponse?.body || {}),
        responseHeaders: JSON.stringify(headers),
      }
    } catch (error: any) {
      const httpStatusCode = error?.statusCode || error?.code || 500
      const headers = error?.headers || {}
      return {
        success: false,
        httpStatusCode: typeof httpStatusCode === "number" ? httpStatusCode : 500,
        requestId: headers["x-amzn-requestid"] || null,
        rateLimitValue: headers["x-amzn-ratelimit-limit"] || null,
        responseBody: JSON.stringify(error?.body || { error: error?.message || "Unknown error" }),
        responseHeaders: JSON.stringify(headers),
        errorCode: error?.code || `HTTP_${httpStatusCode}`,
        errorMessage: error?.message || "Unknown error",
      }
    }
  }

  async getFinancialEvents(orderId: string): Promise<any> {
    return this.client.callAPI({
      operation: "listFinancialEventsByOrderId",
      endpoint: "finances",
      path: { orderId },
    })
  }
}

const clientCache = new Map<string, ReviewsSPClient>()

function safeDecrypt(value: string): string {
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

export async function getReviewsSPClient(organizationId: string): Promise<ReviewsSPClient | null> {
  if (clientCache.has(organizationId)) return clientCache.get(organizationId)!

  const connection = await prisma.amazonConnection.findFirst({
    where: { organizationId, isActive: true },
  })
  if (!connection) return null

  const refreshToken = safeDecrypt(connection.refreshToken)
  const clientId = connection.clientId || process.env.AMAZON_CLIENT_ID || ""
  const clientSecret = connection.clientSecret
    ? safeDecrypt(connection.clientSecret)
    : process.env.AMAZON_CLIENT_SECRET || ""

  if (!refreshToken || !clientId || !clientSecret) return null

  const client = new ReviewsSPClient({
    region: connection.region || "na",
    refreshToken,
    clientId,
    clientSecret,
    marketplaceId: connection.marketplaceId || "ATVPDKIKX0DER",
  })
  clientCache.set(organizationId, client)
  return client
}
