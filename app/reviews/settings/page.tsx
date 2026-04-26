"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ReviewsSettingsPage() {
  const [sendAfterDays, setSendAfterDays] = useState(5)
  const [autoSolicitEnabled, setAutoSolicitEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/reviews/settings")
      .then((r) => r.json())
      .then((s) => {
        setSendAfterDays(s.sendAfterDays ?? 5)
        setAutoSolicitEnabled(s.autoSolicitEnabled ?? true)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    const res = await fetch("/api/reviews/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendAfterDays, autoSolicitEnabled }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Review Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure when and how Amazon review requests are sent for this organization.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Solicitation rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="sendAfterDays">Send after delivery (days)</Label>
              <Input
                id="sendAfterDays"
                type="number"
                min={5}
                max={30}
                value={sendAfterDays}
                onChange={(e) => setSendAfterDays(parseInt(e.target.value || "5", 10))}
                className="mt-2 max-w-[140px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Amazon allows 5–30 days post-delivery. Default: 5.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="autoSolicit"
                type="checkbox"
                checked={autoSolicitEnabled}
                onChange={(e) => setAutoSolicitEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="autoSolicit" className="cursor-pointer">
                Enable daily automated review requests (cron @ 6 AM PT)
              </Label>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
              {saved && <span className="text-sm text-success">Saved</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
