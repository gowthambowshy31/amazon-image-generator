"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Solicitation {
  id: string
  amazonOrderId: string
  status: string
  sentAt: string | null
  httpStatusCode: number | null
  requestId: string | null
  errorMessage: string | null
  createdAt: string
  order: { purchaseDate: string; orderTotal: string | null }
}

export default function SolicitationsPage() {
  const [items, setItems] = useState<Solicitation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/reviews/solicitations?limit=50")
    if (res.ok) {
      const data = await res.json()
      setItems(data.solicitations)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const refreshEligibility = async () => {
    setBusy("eligibility")
    try {
      const res = await fetch("/api/reviews/solicitations/refresh-eligibility", { method: "POST" })
      const data = await res.json()
      alert(`Checked ${data.checked} orders`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const sendBatch = async () => {
    if (!confirm("Send review requests to all eligible orders?")) return
    setBusy("batch")
    try {
      const res = await fetch("/api/reviews/solicitations/send-batch", { method: "POST" })
      const data = await res.json()
      setBatchResult(data)
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Review Solicitations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              History of review requests sent via Amazon SP-API.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshEligibility} disabled={busy !== null}>
              {busy === "eligibility" ? "Checking..." : "Refresh eligibility"}
            </Button>
            <Button onClick={sendBatch} disabled={busy !== null}>
              {busy === "batch" ? "Sending..." : "Send batch now"}
            </Button>
          </div>
        </div>

        {batchResult && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <p className="text-sm">
                <strong>Batch result:</strong> {batchResult.sent || 0} sent ·{" "}
                {batchResult.failed || 0} failed · {batchResult.notEligible || 0} not eligible ·{" "}
                {batchResult.skipped || 0} skipped (of {batchResult.total || 0})
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Solicitations ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Amazon Request ID</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No solicitations yet. Click &quot;Send batch now&quot; once you have eligible orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.amazonOrderId}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "SENT"
                              ? "success"
                              : s.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{s.httpStatusCode ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {s.sentAt ? new Date(s.sentAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{s.requestId ?? "—"}</TableCell>
                      <TableCell className="text-xs text-destructive">
                        {s.errorMessage ?? "—"}
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
