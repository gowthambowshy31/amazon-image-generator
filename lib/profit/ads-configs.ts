// Amazon Ads API v3 report configurations.
// Lifted from amazon-business-analytics/lib/ads-api/client.ts.
// These are the exact configs Amazon accepts — wrong reportTypeId / column
// names = silent FAILED status after 10–20 min of waiting.

export interface ReportConfig {
  name: string
  startDate: string
  endDate: string
  configuration: {
    adProduct: string
    reportTypeId: string
    groupBy: string[]
    columns: string[]
    timeUnit: string
    format: string
  }
}

// Sponsored Products — daily per-ASIN per-campaign performance
export function getSPAdvertisedProductConfig(startDate: string, endDate: string): ReportConfig {
  return {
    name: "SP Advertised Product Report",
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      reportTypeId: "spAdvertisedProduct",
      groupBy: ["advertiser"],
      columns: [
        "date",
        "campaignId",
        "campaignName",
        "adGroupId",
        "adGroupName",
        "advertisedAsin",
        "advertisedSku",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "purchases14d",
        "purchases30d",
        "sales7d",
        "sales14d",
        "sales30d",
        "unitsSoldClicks7d",
        "unitsSoldClicks14d",
        "unitsSoldClicks30d",
      ],
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  }
}

// Sponsored Display — daily per-promoted-ASIN performance
export function getSDAdvertisedProductConfig(startDate: string, endDate: string): ReportConfig {
  return {
    name: "SD Advertised Product Report",
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_DISPLAY",
      reportTypeId: "sdAdvertisedProduct",
      groupBy: ["advertiser"],
      columns: [
        "date",
        "campaignId",
        "campaignName",
        "adGroupId",
        "adGroupName",
        "promotedAsin",
        "promotedSku",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
        "unitsSold",
      ],
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  }
}

// Sponsored Brands — daily campaign-level (no per-ASIN attribution; that needs sbPurchasedProduct)
export function getSBCampaignsConfig(startDate: string, endDate: string): ReportConfig {
  return {
    name: "SB Campaigns Report",
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_BRANDS",
      reportTypeId: "sbCampaigns",
      groupBy: ["campaign"],
      columns: [
        "date",
        "campaignId",
        "campaignName",
        "campaignStatus",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
        "unitsSold",
      ],
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  }
}

// Split a date range into 31-day chunks (Amazon's per-report max).
export function splitDateRange(
  startDate: string,
  endDate: string,
  maxDays = 31,
): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = []
  let current = new Date(startDate + "T00:00:00Z")
  const end = new Date(endDate + "T00:00:00Z")

  while (current <= end) {
    const chunkEnd = new Date(current)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    chunks.push({
      start: current.toISOString().slice(0, 10),
      end: chunkEnd.toISOString().slice(0, 10),
    })
    current = new Date(chunkEnd)
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return chunks
}
