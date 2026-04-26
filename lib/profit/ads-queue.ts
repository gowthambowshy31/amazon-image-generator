/**
 * Ads Report Queue Manager (Prisma-backed, org-scoped).
 *
 * Lifted from amazon-business-analytics/lib/ads-api/report-queue.ts.
 * Why: Amazon Ads reports take 10–20 minutes. We submit all reports at once,
 * then poll periodically. Total time = max(reports), not sum.
 *
 * Lifecycle: SUBMITTED → PENDING → DOWNLOADED → PROCESSED (or FAILED)
 */

import { prisma } from "@/lib/prisma"
import { getAdsCredsForOrg, adsApiCall, type AdsCredentials } from "./ads-client"
import {
  getSPAdvertisedProductConfig,
  getSDAdvertisedProductConfig,
  getSBCampaignsConfig,
  splitDateRange,
  type ReportConfig,
} from "./ads-configs"
import { gunzipSync } from "zlib"

// Map report-type slug → config builder.
// Add more (search terms, targeting, purchased product) as needed later.
const CONFIG_MAP: Record<string, (s: string, e: string) => ReportConfig> = {
  sp_performance: getSPAdvertisedProductConfig,
  sd_performance: getSDAdvertisedProductConfig,
  sb_performance: getSBCampaignsConfig,
}

const CONTENT_TYPE_CREATE = "application/vnd.createasyncreportrequest.v3+json"

// Step 1: Create all reports for an org. Returns immediately with batchId.
export async function createAllReports(
  organizationId: string,
  startDate: string,
  endDate: string,
  reportTypes: string[] = ["sp_performance", "sd_performance", "sb_performance"],
): Promise<{ batchId: string; reportsCreated: number; errors: string[] }> {
  const creds = await getAdsCredsForOrg(organizationId)
  if (!creds) return { batchId: "", reportsCreated: 0, errors: ["No active Ads credentials"] }

  const batchId = `batch-${organizationId}-${Date.now()}`
  const errors: string[] = []
  let created = 0

  for (const reportType of reportTypes) {
    const configFn = CONFIG_MAP[reportType]
    if (!configFn) {
      errors.push(`Unknown report type: ${reportType}`)
      continue
    }

    // SD has ~60 day retention
    let effectiveStart = startDate
    if (reportType.startsWith("sd_")) {
      const minDate = new Date()
      minDate.setDate(minDate.getDate() - 60)
      const minStr = minDate.toISOString().slice(0, 10)
      if (startDate < minStr) effectiveStart = minStr
    }

    const chunks = splitDateRange(effectiveStart, endDate)
    for (const chunk of chunks) {
      try {
        const config = configFn(chunk.start, chunk.end)
        const data: any = await adsApiCall(creds, "/reporting/reports", {
          method: "POST",
          body: config,
          headers: { "Content-Type": CONTENT_TYPE_CREATE },
        }).catch((err) => {
          // 425 errors throw via adsApiCall; we'll catch and parse the message
          const msg = err?.message || String(err)
          const m = msg.match(/duplicate of\s*:\s*([0-9a-f-]{36})/i)
          if (m) return { reportId: m[1], _duplicate: true }
          throw err
        })

        const amazonReportId: string | undefined = data?.reportId
        if (!amazonReportId) {
          errors.push(`${reportType} ${chunk.start}-${chunk.end}: ${JSON.stringify(data)}`)
          continue
        }

        await prisma.adsReportQueue.create({
          data: {
            organizationId,
            reportType,
            startDate: new Date(chunk.start),
            endDate: new Date(chunk.end),
            amazonReportId,
            status: "SUBMITTED",
            batchId,
            submittedAt: new Date(),
          },
        })
        created++
      } catch (err: any) {
        errors.push(`${reportType} ${chunk.start}-${chunk.end}: ${err?.message || String(err)}`)
      }

      // small delay between create calls to be kind to Amazon
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  return { batchId, reportsCreated: created, errors }
}

// Step 2: Poll all SUBMITTED/PENDING reports across all orgs.
// Called by cron every ~5 minutes.
export async function pollPendingReports(): Promise<{
  checked: number
  completed: number
  failed: number
  stillPending: number
  errors: string[]
}> {
  const errors: string[] = []
  let checked = 0
  let completed = 0
  let failed = 0
  let stillPending = 0

  // Group pending rows by organization so we only fetch creds once per org
  const pending = await prisma.adsReportQueue.findMany({
    where: { status: { in: ["SUBMITTED", "PENDING"] } },
    orderBy: { createdAt: "asc" },
  })

  if (pending.length === 0) return { checked: 0, completed: 0, failed: 0, stillPending: 0, errors: [] }

  const credsByOrg = new Map<string, AdsCredentials | null>()

  for (const row of pending) {
    checked++
    let creds = credsByOrg.get(row.organizationId)
    if (creds === undefined) {
      creds = await getAdsCredsForOrg(row.organizationId)
      credsByOrg.set(row.organizationId, creds)
    }
    if (!creds) {
      errors.push(`Queue ${row.id}: no creds for org ${row.organizationId}`)
      continue
    }

    try {
      const data: any = await adsApiCall(creds, `/reporting/reports/${row.amazonReportId}`)

      if (data.status === "COMPLETED" && data.url) {
        // Download and store the URL + row count, defer parse to processBatch
        const dlRes = await fetch(data.url)
        const buffer = Buffer.from(await dlRes.arrayBuffer())
        let rows: any[]
        try {
          rows = JSON.parse(gunzipSync(buffer).toString())
        } catch {
          rows = JSON.parse(buffer.toString())
        }

        await prisma.adsReportQueue.update({
          where: { id: row.id },
          data: {
            status: "DOWNLOADED",
            downloadUrl: data.url,
            completedAt: new Date(),
            downloadedAt: new Date(),
            rowsDownloaded: Array.isArray(rows) ? rows.length : 0,
          },
        })
        completed++
      } else if (data.status === "FAILED") {
        await prisma.adsReportQueue.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            errorMessage:
              data.statusDetails ||
              (typeof data === "string" ? data : JSON.stringify(data).slice(0, 500)),
            completedAt: new Date(),
          },
        })
        failed++
      } else {
        // Still cooking
        if (row.status === "SUBMITTED") {
          await prisma.adsReportQueue.update({
            where: { id: row.id },
            data: { status: "PENDING" },
          })
        }
        stillPending++
      }
    } catch (err: any) {
      errors.push(`Queue ${row.id} (${row.reportType}): ${err?.message || String(err)}`)
    }

    // Polite throttle between status checks
    await new Promise((r) => setTimeout(r, 500))
  }

  if (completed > 0) {
    await processCompletedBatches()
  }

  return { checked, completed, failed, stillPending, errors }
}

// Step 3: For any batch where every row is DOWNLOADED/PROCESSED/FAILED, run the
// processing pipeline that aggregates rows into AdPerformanceDaily / AdCampaignDaily / AdProductDaily.
async function processCompletedBatches() {
  // Find batches that have at least one DOWNLOADED row and no SUBMITTED/PENDING rows
  const downloadedBatches = await prisma.adsReportQueue.findMany({
    where: { status: "DOWNLOADED", batchId: { not: null } },
    select: { batchId: true, organizationId: true },
    distinct: ["batchId"],
  })

  for (const b of downloadedBatches) {
    if (!b.batchId) continue
    const stillRunning = await prisma.adsReportQueue.count({
      where: { batchId: b.batchId, status: { in: ["SUBMITTED", "PENDING"] } },
    })
    if (stillRunning > 0) continue
    try {
      await processBatch(b.batchId, b.organizationId)
    } catch (err) {
      console.error(`[ads-queue] batch ${b.batchId} processing failed:`, err)
    }
  }
}

// Aggregate one completed batch into AdPerformanceDaily + AdCampaignDaily + AdProductDaily
async function processBatch(batchId: string, organizationId: string) {
  const reports = await prisma.adsReportQueue.findMany({
    where: { batchId, status: "DOWNLOADED" },
    orderBy: [{ reportType: "asc" }, { startDate: "asc" }],
  })
  if (reports.length === 0) return

  type DailyAgg = {
    impressions: number
    clicks: number
    spend: number
    adSales7d: number
    adSales14d: number
    adSales30d: number
    adUnits7d: number
    adOrders7d: number
    spSpend: number
    spSales: number
    sbSpend: number
    sbSales: number
    sdSpend: number
    sdSales: number
  }
  const empty = (): DailyAgg => ({
    impressions: 0,
    clicks: 0,
    spend: 0,
    adSales7d: 0,
    adSales14d: 0,
    adSales30d: 0,
    adUnits7d: 0,
    adOrders7d: 0,
    spSpend: 0,
    spSales: 0,
    sbSpend: 0,
    sbSales: 0,
    sdSpend: 0,
    sdSales: 0,
  })

  const dailyMap = new Map<string, DailyAgg>()
  type CampaignRow = {
    date: string
    campaignId: string
    campaignName: string
    adProduct: string
    impressions: number
    clicks: number
    spend: number
    sales7d: number
    sales14d: number
    sales30d: number
    units7d: number
    orders7d: number
  }
  const campaignRows: CampaignRow[] = []
  type ProductRow = {
    date: string
    advertisedAsin: string
    advertisedSku: string
    campaignId: string
    campaignName: string
    adGroupId: string
    adGroupName: string
    adProduct: string
    impressions: number
    clicks: number
    spend: number
    sales7d: number
    sales14d: number
    sales30d: number
    units7d: number
    units14d: number
    units30d: number
    orders7d: number
    orders14d: number
    orders30d: number
  }
  const productRows: ProductRow[] = []

  for (const report of reports) {
    if (!report.downloadUrl) continue
    let rows: any[]
    try {
      const r = await fetch(report.downloadUrl)
      const buf = Buffer.from(await r.arrayBuffer())
      try {
        rows = JSON.parse(gunzipSync(buf).toString())
      } catch {
        rows = JSON.parse(buf.toString())
      }
    } catch {
      continue // URL likely expired (24h); next sync will re-create
    }

    for (const row of rows) {
      const date = String(row.date || "")
      if (!date) continue
      const agg = dailyMap.get(date) || empty()

      const num = (v: any) => Number(v) || 0
      const int = (v: any) => parseInt(String(v ?? 0), 10) || 0
      const imp = int(row.impressions)
      const clk = int(row.clicks)
      const cost = num(row.cost)

      if (report.reportType === "sp_performance") {
        const s7 = num(row.sales7d)
        const s14 = num(row.sales14d)
        const s30 = num(row.sales30d)
        const u7 = int(row.unitsSoldClicks7d)
        const o7 = int(row.purchases7d)

        agg.impressions += imp
        agg.clicks += clk
        agg.spend += cost
        agg.adSales7d += s7
        agg.adSales14d += s14
        agg.adSales30d += s30
        agg.adUnits7d += u7
        agg.adOrders7d += o7
        agg.spSpend += cost
        agg.spSales += s7

        if (row.campaignId) {
          campaignRows.push({
            date,
            campaignId: String(row.campaignId),
            campaignName: String(row.campaignName || ""),
            adProduct: "SPONSORED_PRODUCTS",
            impressions: imp,
            clicks: clk,
            spend: cost,
            sales7d: s7,
            sales14d: s14,
            sales30d: s30,
            units7d: u7,
            orders7d: o7,
          })
        }
        const asin = String(row.advertisedAsin || "")
        if (asin && row.campaignId) {
          productRows.push({
            date,
            advertisedAsin: asin,
            advertisedSku: String(row.advertisedSku || ""),
            campaignId: String(row.campaignId),
            campaignName: String(row.campaignName || ""),
            adGroupId: String(row.adGroupId || ""),
            adGroupName: String(row.adGroupName || ""),
            adProduct: "SPONSORED_PRODUCTS",
            impressions: imp,
            clicks: clk,
            spend: cost,
            sales7d: s7,
            sales14d: s14,
            sales30d: s30,
            units7d: u7,
            units14d: int(row.unitsSoldClicks14d),
            units30d: int(row.unitsSoldClicks30d),
            orders7d: o7,
            orders14d: int(row.purchases14d),
            orders30d: int(row.purchases30d),
          })
        }
      } else if (report.reportType === "sd_performance") {
        const sales = num(row.sales)
        const units = int(row.unitsSold)
        const orders = int(row.purchases)

        agg.impressions += imp
        agg.clicks += clk
        agg.spend += cost
        agg.adSales7d += sales
        agg.adUnits7d += units
        agg.adOrders7d += orders
        agg.sdSpend += cost
        agg.sdSales += sales

        if (row.campaignId) {
          campaignRows.push({
            date,
            campaignId: String(row.campaignId),
            campaignName: String(row.campaignName || ""),
            adProduct: "SPONSORED_DISPLAY",
            impressions: imp,
            clicks: clk,
            spend: cost,
            sales7d: sales,
            sales14d: 0,
            sales30d: 0,
            units7d: units,
            orders7d: orders,
          })
        }
        const asin = String(row.promotedAsin || "")
        if (asin && row.campaignId) {
          productRows.push({
            date,
            advertisedAsin: asin,
            advertisedSku: String(row.promotedSku || ""),
            campaignId: String(row.campaignId),
            campaignName: String(row.campaignName || ""),
            adGroupId: String(row.adGroupId || ""),
            adGroupName: String(row.adGroupName || ""),
            adProduct: "SPONSORED_DISPLAY",
            impressions: imp,
            clicks: clk,
            spend: cost,
            sales7d: sales,
            sales14d: 0,
            sales30d: 0,
            units7d: units,
            units14d: 0,
            units30d: 0,
            orders7d: orders,
            orders14d: 0,
            orders30d: 0,
          })
        }
      } else if (report.reportType === "sb_performance") {
        const sales = num(row.sales)
        const units = int(row.unitsSold)
        const orders = int(row.purchases)

        agg.impressions += imp
        agg.clicks += clk
        agg.spend += cost
        agg.adSales14d += sales // SB attribution is 14d
        agg.sbSpend += cost
        agg.sbSales += sales

        if (row.campaignId) {
          campaignRows.push({
            date,
            campaignId: String(row.campaignId),
            campaignName: String(row.campaignName || ""),
            adProduct: "SPONSORED_BRANDS",
            impressions: imp,
            clicks: clk,
            spend: cost,
            sales7d: 0,
            sales14d: sales,
            sales30d: 0,
            units7d: units,
            orders7d: orders,
          })
        }
      }

      dailyMap.set(date, agg)
    }
  }

  // UPSERT daily aggregates
  for (const [date, agg] of dailyMap) {
    const acos = agg.adSales7d > 0 ? agg.spend / agg.adSales7d : null
    await prisma.adPerformanceDaily.upsert({
      where: { organizationId_date: { organizationId, date: new Date(date) } },
      create: {
        organizationId,
        date: new Date(date),
        ...agg,
        acos7d: acos,
      },
      update: {
        ...agg,
        acos7d: acos,
      },
    })
  }

  // Roll up campaign rows (same date+campaign across multiple chunks/products)
  const campMap = new Map<string, CampaignRow>()
  for (const r of campaignRows) {
    const k = `${r.date}|${r.campaignId}`
    const e = campMap.get(k)
    if (e) {
      e.impressions += r.impressions
      e.clicks += r.clicks
      e.spend += r.spend
      e.sales7d += r.sales7d
      e.sales14d += r.sales14d
      e.sales30d += r.sales30d
      e.units7d += r.units7d
      e.orders7d += r.orders7d
    } else {
      campMap.set(k, { ...r })
    }
  }
  for (const r of campMap.values()) {
    await prisma.adCampaignDaily.upsert({
      where: {
        organizationId_date_campaignId: {
          organizationId,
          date: new Date(r.date),
          campaignId: r.campaignId,
        },
      },
      create: {
        organizationId,
        date: new Date(r.date),
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        adProduct: r.adProduct,
        impressions: r.impressions,
        clicks: r.clicks,
        spend: r.spend,
        sales7d: r.sales7d,
        sales14d: r.sales14d,
        sales30d: r.sales30d,
        units7d: r.units7d,
        orders7d: r.orders7d,
      },
      update: {
        campaignName: r.campaignName,
        impressions: r.impressions,
        clicks: r.clicks,
        spend: r.spend,
        sales7d: r.sales7d,
        sales14d: r.sales14d,
        sales30d: r.sales30d,
        units7d: r.units7d,
        orders7d: r.orders7d,
      },
    })
  }

  // Roll up per-ASIN rows
  const prodMap = new Map<string, ProductRow>()
  for (const r of productRows) {
    const k = `${r.date}|${r.advertisedAsin}|${r.campaignId}`
    const e = prodMap.get(k)
    if (e) {
      e.impressions += r.impressions
      e.clicks += r.clicks
      e.spend += r.spend
      e.sales7d += r.sales7d
      e.sales14d += r.sales14d
      e.sales30d += r.sales30d
      e.units7d += r.units7d
      e.units14d += r.units14d
      e.units30d += r.units30d
      e.orders7d += r.orders7d
      e.orders14d += r.orders14d
      e.orders30d += r.orders30d
    } else {
      prodMap.set(k, { ...r })
    }
  }
  for (const r of prodMap.values()) {
    await prisma.adProductDaily.upsert({
      where: {
        organizationId_date_advertisedAsin_campaignId: {
          organizationId,
          date: new Date(r.date),
          advertisedAsin: r.advertisedAsin,
          campaignId: r.campaignId,
        },
      },
      create: {
        organizationId,
        date: new Date(r.date),
        advertisedAsin: r.advertisedAsin,
        advertisedSku: r.advertisedSku,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        adGroupId: r.adGroupId,
        adGroupName: r.adGroupName,
        adProduct: r.adProduct,
        impressions: r.impressions,
        clicks: r.clicks,
        spend: r.spend,
        sales7d: r.sales7d,
        sales14d: r.sales14d,
        sales30d: r.sales30d,
        units7d: r.units7d,
        units14d: r.units14d,
        units30d: r.units30d,
        orders7d: r.orders7d,
        orders14d: r.orders14d,
        orders30d: r.orders30d,
      },
      update: {
        advertisedSku: r.advertisedSku,
        campaignName: r.campaignName,
        adGroupId: r.adGroupId,
        adGroupName: r.adGroupName,
        impressions: r.impressions,
        clicks: r.clicks,
        spend: r.spend,
        sales7d: r.sales7d,
        sales14d: r.sales14d,
        sales30d: r.sales30d,
        units7d: r.units7d,
        units14d: r.units14d,
        units30d: r.units30d,
        orders7d: r.orders7d,
        orders14d: r.orders14d,
        orders30d: r.orders30d,
      },
    })
  }

  // Mark all rows in this batch as PROCESSED
  await prisma.adsReportQueue.updateMany({
    where: { batchId, status: "DOWNLOADED" },
    data: { status: "PROCESSED", processedAt: new Date() },
  })
}

// Convenience: get queue status for an org
export async function getQueueStatus(organizationId: string) {
  return prisma.adsReportQueue.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
}
