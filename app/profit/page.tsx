"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ProfitOverviewPage() {
  const [adsSummary, setAdsSummary] = useState<any>(null)
  const [reimbursements, setReimbursements] = useState<any>(null)
  const [reportCount, setReportCount] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch("/api/profit/advertising?days=30").then((r) => r.ok ? r.json() : null),
      fetch("/api/profit/reimbursements?limit=1").then((r) => r.ok ? r.json() : null),
      fetch("/api/profit/reports").then((r) => r.ok ? r.json() : []),
    ]).then(([ads, reimb, reports]) => {
      setAdsSummary(ads?.summary)
      setReimbursements(reimb)
      setReportCount(Array.isArray(reports) ? reports.length : 0)
    })
  }, [])

  const acos = adsSummary && adsSummary.adSales7d > 0 ? ((adsSummary.spend / adsSummary.adSales7d) * 100).toFixed(1) : "—"

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Profit Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Advertising, profitability, reimbursements, and inventory at a glance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link href="/profit/advertising" className="hover:scale-[1.01] transition-transform">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Ad spend (30d)</div>
                <div className="text-2xl font-bold mt-1">${adsSummary?.spend?.toFixed(2) ?? "0.00"}</div>
                <div className="text-xs text-muted-foreground mt-1">ACOS: {acos}%</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/profit/reimbursements" className="hover:scale-[1.01] transition-transform">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Reimbursements</div>
                <div className="text-2xl font-bold mt-1">${(reimbursements?.totalAmount || 0).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-1">{reimbursements?.total || 0} records · {reimbursements?.potentialClaims?.length || 0} potential</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/profit/reports" className="hover:scale-[1.01] transition-transform">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">P&amp;L reports</div>
                <div className="text-2xl font-bold mt-1">{reportCount}</div>
                <div className="text-xs text-muted-foreground mt-1">uploaded</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/profit/inventory" className="hover:scale-[1.01] transition-transform">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Inventory</div>
                <div className="text-2xl font-bold mt-1">View</div>
                <div className="text-xs text-muted-foreground mt-1">snapshots + live</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader><CardTitle>Modules</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <Link href="/profit/advertising" className="border border-border rounded-lg p-4 hover:bg-accent">
              <div className="font-semibold">Advertising</div>
              <div className="text-muted-foreground text-xs mt-1">Daily ad performance + campaign drill-down (Sponsored Products / Brands / Display)</div>
            </Link>
            <Link href="/profit/reports" className="border border-border rounded-lg p-4 hover:bg-accent">
              <div className="font-semibold">Reports (P&amp;L)</div>
              <div className="text-muted-foreground text-xs mt-1">Upload Amazon profitability reports (Excel) and view per-product margins</div>
            </Link>
            <Link href="/profit/inventory" className="border border-border rounded-lg p-4 hover:bg-accent">
              <div className="font-semibold">Inventory</div>
              <div className="text-muted-foreground text-xs mt-1">Live FBA inventory + dated snapshots for reconciliation</div>
            </Link>
            <Link href="/profit/reimbursements" className="border border-border rounded-lg p-4 hover:bg-accent">
              <div className="font-semibold">Reimbursements</div>
              <div className="text-muted-foreground text-xs mt-1">Synced reimbursements + potential claim detection + manual claim tracker</div>
            </Link>
            <Link href="/profit/purchase-orders" className="border border-border rounded-lg p-4 hover:bg-accent">
              <div className="font-semibold">Purchase Orders</div>
              <div className="text-muted-foreground text-xs mt-1">Factory POs with line-item status tracking</div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
