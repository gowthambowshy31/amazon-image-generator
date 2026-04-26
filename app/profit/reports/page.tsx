"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Report {
  id: string
  filename: string
  reportDate: string | null
  totalRows: number
  uploadedAt: string
}

export default function ProfitReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/profit/reports")
    if (res.ok) setReports(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/profit/reports/upload", { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        alert(`Imported ${data.totalRows} rows.`)
        await load()
      } else {
        alert("Upload failed.")
      }
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Profitability Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload Amazon profitability Excel reports for per-product margin analysis.
            </p>
          </div>
          <label>
            <input type="file" accept=".xlsx,.xls" onChange={upload} disabled={uploading} className="hidden" />
            <Button asChild disabled={uploading}>
              <span>{uploading ? "Uploading..." : "Upload report"}</span>
            </Button>
          </label>
        </div>

        <Card>
          <CardHeader><CardTitle>Uploaded reports ({reports.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : reports.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No reports yet. Upload an Excel file.
                  </TableCell></TableRow>
                ) : reports.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.filename}</TableCell>
                    <TableCell className="text-sm">{r.totalRows}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.uploadedAt).toLocaleString()}</TableCell>
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
