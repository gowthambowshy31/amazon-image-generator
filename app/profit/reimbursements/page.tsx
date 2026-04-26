"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function ReimbursementsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [claims, setClaims] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/profit/reimbursements?limit=100").then((r) => r.json()),
      fetch("/api/profit/reimbursements/claims").then((r) => r.json()),
    ]).then(([d, c]) => {
      setData(d)
      setClaims(c)
      setLoading(false)
    })
  }, [])

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reimbursements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Synced reimbursements + AI-detected potential claims + your manual claim tracker.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total reimbursed</div><div className="text-xl font-bold">${(data?.totalAmount || 0).toFixed(2)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Records</div><div className="text-xl font-bold">{data?.total || 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Potential claims</div><div className="text-xl font-bold">{data?.potentialClaims?.length || 0}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Potential claims ({data?.potentialClaims?.length || 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Estimated</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.potentialClaims?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No potential claims detected.</TableCell></TableRow>
                ) : data.potentialClaims.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.claimType}</TableCell>
                    <TableCell className="font-mono text-xs">{c.asin ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={c.description}>{c.description}</TableCell>
                    <TableCell className="text-sm">{c.estimatedValue ? `$${c.estimatedValue.toFixed(2)}` : "—"}</TableCell>
                    <TableCell className="text-xs">{c.claimDeadline ? new Date(c.claimDeadline).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Synced reimbursements ({data?.reimbursements?.length || 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approval</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !data?.reimbursements?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No reimbursements synced yet.</TableCell></TableRow>
                ) : data.reimbursements.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.approvalDate ? new Date(r.approvalDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.asin ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.quantityReimbursedTotal ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.amountTotal ? `$${r.amountTotal.toFixed(2)}` : "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.amazonOrderId ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>My claims ({claims.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {!claims.length ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No claims tracked yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ASIN</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Estimated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.asin ?? "—"}</TableCell>
                      <TableCell className="text-xs">{c.claimType ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.estimatedValue ? `$${c.estimatedValue.toFixed(2)}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                      <TableCell className="text-xs">{c.filedAt ? new Date(c.filedAt).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
