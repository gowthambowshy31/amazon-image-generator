"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface PurchaseOrder {
  id: string
  poNumber: string
  factoryName: string
  status: string
  orderDate: string | null
  expectedDate: string | null
  notes: string | null
  items: any[]
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [factory, setFactory] = useState("")
  const [notes, setNotes] = useState("")

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/profit/purchase-orders")
    if (res.ok) setOrders(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!factory.trim()) return
    setCreating(true)
    try {
      await fetch("/api/profit/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryName: factory, notes }),
      })
      setFactory("")
      setNotes("")
      await load()
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Factory POs with line-item status tracking.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>New PO</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Factory name</Label>
                <Input value={factory} onChange={(e) => setFactory(e.target.value)} placeholder="e.g. Acme Manufacturing" />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <Button onClick={create} disabled={creating || !factory.trim()}>{creating ? "Creating..." : "Create PO"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Purchase orders ({orders.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Factory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : orders.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No purchase orders yet.</TableCell></TableRow>
                ) : orders.map(po => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-xs">{po.poNumber}</TableCell>
                    <TableCell className="text-sm">{po.factoryName}</TableCell>
                    <TableCell><Badge variant="secondary">{po.status}</Badge></TableCell>
                    <TableCell className="text-sm">{po.items?.length || 0}</TableCell>
                    <TableCell className="text-xs">{po.orderDate ? new Date(po.orderDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "—"}</TableCell>
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
