import * as XLSX from "xlsx"
import { prisma } from "@/lib/prisma"

interface ParsedRow {
  asin: string | null
  sku: string
  parentAsin: string | null
  metrics: Record<string, any>
}

export function parseProfitabilityExcel(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null })
  return rows
    .map((r) => {
      const sku = String(r["SKU"] || r["sku"] || "").trim()
      if (!sku) return null
      const asin = (r["ASIN"] || r["asin"] || null) as string | null
      const parentAsin = (r["Parent ASIN"] || r["parent_asin"] || null) as string | null
      return { asin, sku, parentAsin, metrics: r }
    })
    .filter((r): r is ParsedRow => !!r)
}

export async function importProfitabilityReport(
  organizationId: string,
  filename: string,
  buffer: Buffer,
): Promise<{ reportId: string; totalRows: number }> {
  const rows = parseProfitabilityExcel(buffer)
  const report = await prisma.profitReport.create({
    data: {
      organizationId,
      filename,
      reportDate: new Date(),
      totalRows: rows.length,
    },
  })
  if (rows.length > 0) {
    await prisma.profitReportProduct.createMany({
      data: rows.map((r) => ({
        reportId: report.id,
        asin: r.asin,
        sku: r.sku,
        parentAsin: r.parentAsin,
        metrics: r.metrics,
      })),
    })
  }
  return { reportId: report.id, totalRows: rows.length }
}
