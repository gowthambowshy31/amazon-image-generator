"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Order {
  id: string
  amazonOrderId: string
  purchaseDate: string
  orderStatus: string
  isEligible: boolean
  isRefunded: boolean
  earliestDeliveryDate: string | null
  latestDeliveryDate: string | null
  solicitation: { status: string; sentAt: string | null } | null
}

export default function ReviewsOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [eligibleOnly, setEligibleOnly] = useState(false)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (eligibleOnly) params.set("eligible", "true")
    const res = await fetch(`/api/reviews/orders?${params}`)
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const syncOrders = async () => {
    setSyncing(true)
    try {
      await fetch("/api/reviews/orders/sync", { method: "POST" })
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
            <h1 className="text-2xl font-bold">Review Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Amazon orders eligible for review solicitation (last 45 days).
            </p>
          </div>
          <Button onClick={syncOrders} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync from Amazon"}
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4 flex gap-3 items-center">
            <Input
              placeholder="Search by order ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
              />
              Eligible only
            </label>
            <Button variant="outline" onClick={load}>
              Filter
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery Window</TableHead>
                  <TableHead>Eligible</TableHead>
                  <TableHead>Refunded</TableHead>
                  <TableHead>Solicitation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No orders. Click &quot;Sync from Amazon&quot; to import the last 45 days.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.amazonOrderId}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(o.purchaseDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.orderStatus === "Shipped" ? "success" : "secondary"}>
                          {o.orderStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {o.earliestDeliveryDate
                          ? `${new Date(o.earliestDeliveryDate).toLocaleDateString()} – ${o.latestDeliveryDate ? new Date(o.latestDeliveryDate).toLocaleDateString() : "?"}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {o.isEligible ? (
                          <Badge variant="success">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {o.isRefunded ? <Badge variant="destructive">Yes</Badge> : "—"}
                      </TableCell>
                      <TableCell>
                        {o.solicitation ? (
                          <Badge
                            variant={
                              o.solicitation.status === "SENT"
                                ? "success"
                                : o.solicitation.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {o.solicitation.status}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
