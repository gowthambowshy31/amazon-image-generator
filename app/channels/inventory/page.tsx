"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Sku {
  id: string
  amazonSku: string
  amazonAsin: string | null
  ebaySku: string | null
  ebayItemId: string | null
  title: string | null
  amazonQuantity: number
  ebayQuantity: number
  lastSyncedAt: string | null
  lastSyncError: string | null
  migrationStatus: string | null
}

export default function ChannelsInventoryPage() {
  const [items, setItems] = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [result, setResult] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    const res = await fetch(`/api/channels/inventory?${params}`)
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch("/api/channels/inventory/sync", { method: "POST" })
      const data = await res.json()
      setResult(data)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Channels Inventory</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Amazon FBA inventory mirrored to mapped eBay listings.
            </p>
          </div>
          <Button onClick={sync} disabled={syncing}>{syncing ? "Syncing..." : "Sync Amazon → eBay"}</Button>
        </div>

        {result && (
          <Card className="mb-6">
            <CardContent className="p-4 text-sm">
              <strong>Sync result:</strong> Amazon items: {result.totalAmazonItems ?? 0} ·
              upserted: {result.productsUpserted ?? 0} · eBay updates: {result.ebayUpdates ?? 0} ·
              errors: {result.errors ?? 0}
              {result.error && <div className="text-destructive mt-1">{result.error}</div>}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="p-4 flex gap-3">
            <Input
              placeholder="Search by SKU/ASIN/title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={load}>Filter</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>SKUs ({items.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amazon SKU</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>eBay Item</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Amz Qty</TableHead>
                  <TableHead>eBay Qty</TableHead>
                  <TableHead>Last Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No SKUs yet. Click &quot;Sync Amazon → eBay&quot; to import FBA inventory.
                  </TableCell></TableRow>
                ) : items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.amazonSku}</TableCell>
                    <TableCell className="font-mono text-xs">{item.amazonAsin ?? "—"}</TableCell>
                    <TableCell className="text-xs">{item.ebayItemId ?? <Badge variant="secondary">unmapped</Badge>}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={item.title || ""}>{item.title}</TableCell>
                    <TableCell className="text-sm">{item.amazonQuantity}</TableCell>
                    <TableCell className="text-sm">{item.ebayQuantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleString() : "—"}
                      {item.lastSyncError && <span className="text-destructive block truncate max-w-[200px]" title={item.lastSyncError}>err</span>}
                    </TableCell>
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
