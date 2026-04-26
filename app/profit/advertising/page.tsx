"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function AdvertisingPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [days, setDays] = useState(30)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/profit/advertising?days=${days}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    setSyncing(true)
    try {
      await fetch("/api/profit/advertising/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) })
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const summary = data?.summary
  const acos = summary && summary.adSales7d > 0 ? ((summary.spend / summary.adSales7d) * 100).toFixed(1) : "—"

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Advertising</h1>
            <p className="text-sm text-muted-foreground mt-1">Sponsored Products, Brands, Display performance.</p>
          </div>
          <div className="flex gap-2">
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="h-9 rounded-md border border-input bg-secondary px-3 py-2 text-sm">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button onClick={sync} disabled={syncing}>{syncing ? "Syncing..." : "Sync from Amazon Ads"}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Impressions</div><div className="text-xl font-bold">{(summary?.impressions || 0).toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Clicks</div><div className="text-xl font-bold">{(summary?.clicks || 0).toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Spend</div><div className="text-xl font-bold">${(summary?.spend || 0).toFixed(2)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ACOS (7d)</div><div className="text-xl font-bold">{acos}%</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Top campaigns ({(data?.campaigns || []).length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Impressions</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Sales (7d)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : (data?.campaigns || []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No campaign data. Click &quot;Sync from Amazon Ads&quot; to import.
                  </TableCell></TableRow>
                ) : (data?.campaigns || []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{new Date(c.date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={c.campaignName || ""}>{c.campaignName || c.campaignId}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{c.adProduct.replace("SPONSORED_", "S")}</Badge></TableCell>
                    <TableCell className="text-sm">{c.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{c.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">${c.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">${c.sales7d.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
