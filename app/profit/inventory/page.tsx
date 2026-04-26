"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface InventoryItem {
  id: string
  asin: string
  sku: string | null
  productName: string | null
  fulfillableQty: number
  totalQty: number
  lastUpdated: string
}

interface Snapshot {
  id: string
  snapshotDate: string
  totalAsins: number
  totalUnits: number
  notes: string | null
}

export default function ProfitInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [invRes, snapRes] = await Promise.all([
      fetch("/api/profit/inventory/current"),
      fetch("/api/profit/inventory/snapshots"),
    ])
    if (invRes.ok) {
      const data = await invRes.json()
      setItems(data.items)
    }
    if (snapRes.ok) setSnapshots(await snapRes.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const refreshLive = async () => {
    setRefreshing(true)
    try {
      await fetch("/api/profit/inventory/current", { method: "POST" })
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const takeSnapshot = async () => {
    setSnapshotting(true)
    try {
      await fetch("/api/profit/inventory/snapshots", { method: "POST" })
      await load()
    } finally {
      setSnapshotting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-sm text-muted-foreground mt-1">Live FBA inventory + dated snapshots.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshLive} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh live"}</Button>
            <Button onClick={takeSnapshot} disabled={snapshotting}>{snapshotting ? "Snapshotting..." : "Take snapshot"}</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Snapshots ({snapshots.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>ASINs</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No snapshots yet.</TableCell></TableRow>
                ) : snapshots.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{new Date(s.snapshotDate).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{s.totalAsins}</TableCell>
                    <TableCell className="text-sm">{s.totalUnits.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Live inventory ({items.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ASIN</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Fulfillable</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No inventory data. Click &quot;Refresh live&quot; to import from SP-API.</TableCell></TableRow>
                ) : items.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.asin}</TableCell>
                    <TableCell className="text-xs">{i.sku ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={i.productName || ""}>{i.productName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{i.fulfillableQty}</TableCell>
                    <TableCell className="text-sm">{i.totalQty}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(i.lastUpdated).toLocaleString()}</TableCell>
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
