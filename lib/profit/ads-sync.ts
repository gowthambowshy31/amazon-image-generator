import { prisma } from "@/lib/prisma"
import { adsApiCall, type AdsCredentials } from "./ads-client"
import { format, subDays } from "date-fns"

interface ReportRequest {
  reportId: string
  status: string
  url?: string
}

// Submit an async ad-product report (Sponsored Products / Brands / Display)
async function submitAdReport(
  c: AdsCredentials,
  adProduct: "SPONSORED_PRODUCTS" | "SPONSORED_BRANDS" | "SPONSORED_DISPLAY",
  startDate: string,
  endDate: string,
): Promise<string> {
  const body = {
    name: `${adProduct} ${startDate} to ${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct,
      groupBy: ["campaign"],
      columns: [
        "date",
        "campaignId",
        "campaignName",
        "impressions",
        "clicks",
        "cost",
        "sales7d",
        "sales14d",
        "sales30d",
        "unitsSoldClicks7d",
        "purchases7d",
      ],
      reportTypeId:
        adProduct === "SPONSORED_PRODUCTS"
          ? "spCampaigns"
          : adProduct === "SPONSORED_BRANDS"
            ? "sbCampaigns"
            : "sdCampaigns",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  }
  const resp = await adsApiCall<ReportRequest>(c, "/reporting/reports", {
    method: "POST",
    body,
  })
  return resp.reportId
}

async function pollReport(c: AdsCredentials, reportId: string): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    const resp = await adsApiCall<ReportRequest>(c, `/reporting/reports/${reportId}`)
    if (resp.status === "COMPLETED" && resp.url) return resp.url
    if (resp.status === "FAILED") return null
    await new Promise((r) => setTimeout(r, 10_000))
  }
  return null
}

async function downloadAndParse(url: string): Promise<any[]> {
  const r = await fetch(url)
  if (!r.ok) return []
  const buf = await r.arrayBuffer()
  // Most reports come back gzipped; unzip
  const zlib = await import("zlib")
  const inflated = zlib.gunzipSync(Buffer.from(buf))
  const lines = inflated.toString("utf-8").trim().split("\n")
  return lines
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean) as any[]
}

export async function syncAdsDaily(organizationId: string, daysBack: number = 7) {
  const start = Date.now()
  const log = await prisma.adSyncLog.create({
    data: {
      organizationId,
      syncType: "DAILY",
      startDate: subDays(new Date(), daysBack),
      endDate: new Date(),
      status: "RUNNING",
    },
  })

  const c = await (await import("./ads-client")).getAdsCredsForOrg(organizationId)
  if (!c) {
    await prisma.adSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: "No active Ads connection", completedAt: new Date() },
    })
    return { error: "No active Ads connection" }
  }

  let totalRows = 0
  try {
    const startDate = format(subDays(new Date(), daysBack), "yyyy-MM-dd")
    const endDate = format(subDays(new Date(), 1), "yyyy-MM-dd")
    const adProducts = ["SPONSORED_PRODUCTS", "SPONSORED_BRANDS", "SPONSORED_DISPLAY"] as const
    const allRows: { adProduct: string; rows: any[] }[] = []

    const perProductErrors: string[] = []
    for (const ap of adProducts) {
      try {
        const reportId = await submitAdReport(c, ap, startDate, endDate)
        const url = await pollReport(c, reportId)
        if (!url) {
          perProductErrors.push(`${ap}: report poll returned no URL (likely FAILED status)`)
          continue
        }
        const rows = await downloadAndParse(url)
        allRows.push({ adProduct: ap, rows })
      } catch (e: any) {
        perProductErrors.push(`${ap}: ${e?.message || String(e)}`)
      }
    }
    if (perProductErrors.length) {
      console.error("[ads-sync] per-product errors:", perProductErrors)
    }

    // Aggregate per (date, campaign) and per (date)
    const dailyAgg = new Map<string, any>()
    for (const { adProduct, rows } of allRows) {
      for (const row of rows) {
        const date = (row.date || row.reportDate || "").slice(0, 10)
        if (!date) continue
        const campaignId = String(row.campaignId || "")
        // campaign-level upsert
        if (campaignId) {
          await prisma.adCampaignDaily.upsert({
            where: {
              organizationId_date_campaignId: {
                organizationId,
                date: new Date(date),
                campaignId,
              },
            },
            create: {
              organizationId,
              date: new Date(date),
              campaignId,
              campaignName: row.campaignName,
              adProduct,
              impressions: parseInt(String(row.impressions || 0), 10),
              clicks: parseInt(String(row.clicks || 0), 10),
              spend: parseFloat(String(row.cost || 0)),
              sales7d: parseFloat(String(row.sales7d || 0)),
              sales14d: parseFloat(String(row.sales14d || 0)),
              sales30d: parseFloat(String(row.sales30d || 0)),
              units7d: parseInt(String(row.unitsSoldClicks7d || 0), 10),
              orders7d: parseInt(String(row.purchases7d || 0), 10),
            },
            update: {
              campaignName: row.campaignName,
              impressions: parseInt(String(row.impressions || 0), 10),
              clicks: parseInt(String(row.clicks || 0), 10),
              spend: parseFloat(String(row.cost || 0)),
              sales7d: parseFloat(String(row.sales7d || 0)),
              sales14d: parseFloat(String(row.sales14d || 0)),
              sales30d: parseFloat(String(row.sales30d || 0)),
              units7d: parseInt(String(row.unitsSoldClicks7d || 0), 10),
              orders7d: parseInt(String(row.purchases7d || 0), 10),
            },
          })
          totalRows++
        }
        const agg = dailyAgg.get(date) || {
          impressions: 0, clicks: 0, spend: 0,
          adSales7d: 0, adSales14d: 0, adSales30d: 0, adUnits7d: 0, adOrders7d: 0,
          spSpend: 0, spSales: 0, sbSpend: 0, sbSales: 0, sdSpend: 0, sdSales: 0,
        }
        agg.impressions += parseInt(String(row.impressions || 0), 10)
        agg.clicks += parseInt(String(row.clicks || 0), 10)
        const spend = parseFloat(String(row.cost || 0))
        const s7 = parseFloat(String(row.sales7d || 0))
        agg.spend += spend
        agg.adSales7d += s7
        agg.adSales14d += parseFloat(String(row.sales14d || 0))
        agg.adSales30d += parseFloat(String(row.sales30d || 0))
        agg.adUnits7d += parseInt(String(row.unitsSoldClicks7d || 0), 10)
        agg.adOrders7d += parseInt(String(row.purchases7d || 0), 10)
        if (adProduct === "SPONSORED_PRODUCTS") { agg.spSpend += spend; agg.spSales += s7 }
        if (adProduct === "SPONSORED_BRANDS") { agg.sbSpend += spend; agg.sbSales += s7 }
        if (adProduct === "SPONSORED_DISPLAY") { agg.sdSpend += spend; agg.sdSales += s7 }
        dailyAgg.set(date, agg)
      }
    }

    for (const [date, agg] of dailyAgg) {
      const acos = agg.adSales7d > 0 ? agg.spend / agg.adSales7d : null
      await prisma.adPerformanceDaily.upsert({
        where: { organizationId_date: { organizationId, date: new Date(date) } },
        create: { organizationId, date: new Date(date), ...agg, acos7d: acos },
        update: { ...agg, acos7d: acos },
      })
    }

    const finalStatus = perProductErrors.length === adProducts.length ? "FAILED" : "DONE"
    await prisma.adSyncLog.update({
      where: { id: log.id },
      data: {
        status: finalStatus,
        rowsImported: totalRows,
        errorMessage: perProductErrors.length ? perProductErrors.join(" | ") : null,
        completedAt: new Date(),
      },
    })
    return { totalRows, durationMs: Date.now() - start, perProductErrors }
  } catch (e: any) {
    await prisma.adSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: e?.message || String(e), rowsImported: totalRows, completedAt: new Date() },
    })
    throw e
  }
}
