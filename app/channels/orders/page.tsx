"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface McfOrder {
  id: string
  ebayOrderId: string
  ebayBuyerUsername: string | null
  amazonFulfillmentId: string | null
  status: string
  shippingName: string | null
  shippingCity: string | null
  trackingNumber: string | null
  carrierCode: string | null
  totalPrice: number | null
  currency: string | null
  errorMessage: string | null
  createdAt: string
  items: { amazonSku: string; quantity: number }[]
}

export default function ChannelsOrdersPage() {
  const [items, setItems] = useState<McfOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/channels/orders?limit=100")
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const poll = async () => {
    setPolling(true)
    try {
      await fetch("/api/channels/orders/poll", { method: "POST" })
      await load()
    } finally {
      setPolling(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">MCF Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">
              eBay orders routed to Amazon FBA fulfillment.
            </p>
          </div>
          <Button onClick={poll} disabled={polling}>
            {polling ? "Polling..." : "Poll eBay now"}
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>MCF Orders ({items.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>eBay Order</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Ship to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No MCF orders yet. Click &quot;Poll eBay now&quot; to check for new orders.
                  </TableCell></TableRow>
                ) : items.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.ebayOrderId}</TableCell>
                    <TableCell className="text-sm">{o.ebayBuyerUsername ?? "—"}</TableCell>
                    <TableCell className="text-xs">{o.items.length} item{o.items.length !== 1 && "s"}</TableCell>
                    <TableCell className="text-xs">{o.shippingName ? `${o.shippingName}, ${o.shippingCity}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "submitted" || o.status === "processing" ? "secondary" : o.status === "failed" ? "destructive" : "success"}>{o.status}</Badge>
                      {o.errorMessage && <span className="text-xs text-destructive block truncate max-w-[200px]" title={o.errorMessage}>{o.errorMessage}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{o.trackingNumber ? `${o.carrierCode || ""} ${o.trackingNumber}` : "—"}</TableCell>
                    <TableCell className="text-sm">{o.totalPrice ? `${o.currency || ""} ${o.totalPrice.toFixed(2)}` : "—"}</TableCell>
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
