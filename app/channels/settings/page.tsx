"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ChannelsSettingsPage() {
  const [config, setConfig] = useState<any>({
    quantityBuffer: 5,
    syncIntervalMins: 30,
    orderPollMins: 15,
    autoSyncEnabled: true,
    shippingSpeed: "Standard",
  })
  const [ebayConn, setEbayConn] = useState<any>(null)
  const [ebayForm, setEbayForm] = useState({
    environment: "production",
    clientId: "",
    clientSecret: "",
    devId: "",
    redirectUri: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const [cfgRes, connRes] = await Promise.all([
      fetch("/api/channels/settings"),
      fetch("/api/channels/ebay/connection"),
    ])
    if (cfgRes.ok) setConfig(await cfgRes.json())
    if (connRes.ok) {
      const conn = await connRes.json()
      setEbayConn(conn)
      if (conn.connected) {
        setEbayForm((f) => ({
          ...f,
          environment: conn.environment,
          redirectUri: conn.redirectUri,
        }))
      }
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saveConfig = async () => {
    setSaving(true)
    setSaved(false)
    const res = await fetch("/api/channels/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
  }

  const saveEbayCreds = async () => {
    const res = await fetch("/api/channels/ebay/connection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ebayForm),
    })
    if (res.ok) {
      await load()
      alert("eBay app credentials saved. Click 'Connect eBay account' to authorize.")
    }
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Channels Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Amazon → eBay sync behavior and connect your eBay seller account.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Sync configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Quantity buffer (units kept on Amazon, not pushed to eBay)</Label>
              <Input type="number" value={config.quantityBuffer}
                onChange={(e) => setConfig({ ...config, quantityBuffer: parseInt(e.target.value || "5", 10) })}
                className="mt-1 max-w-[120px]" />
            </div>
            <div>
              <Label>Inventory sync interval (minutes)</Label>
              <Input type="number" value={config.syncIntervalMins}
                onChange={(e) => setConfig({ ...config, syncIntervalMins: parseInt(e.target.value || "30", 10) })}
                className="mt-1 max-w-[120px]" />
            </div>
            <div>
              <Label>Order poll interval (minutes)</Label>
              <Input type="number" value={config.orderPollMins}
                onChange={(e) => setConfig({ ...config, orderPollMins: parseInt(e.target.value || "15", 10) })}
                className="mt-1 max-w-[120px]" />
            </div>
            <div>
              <Label>Default shipping speed (Amazon MCF)</Label>
              <select value={config.shippingSpeed}
                onChange={(e) => setConfig({ ...config, shippingSpeed: e.target.value })}
                className="mt-1 flex h-9 w-40 rounded-md border border-input bg-secondary px-3 py-2 text-sm">
                <option value="Standard">Standard</option>
                <option value="Expedited">Expedited</option>
                <option value="Priority">Priority</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoSync" checked={config.autoSyncEnabled}
                onChange={(e) => setConfig({ ...config, autoSyncEnabled: e.target.checked })} />
              <Label htmlFor="autoSync" className="cursor-pointer">Enable cron auto-sync</Label>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={saveConfig} disabled={saving}>{saving ? "Saving..." : "Save sync config"}</Button>
              {saved && <span className="text-sm text-success">Saved</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>eBay connection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {ebayConn?.connected ? (
              <div className="text-sm">
                <p>Status: <span className={ebayConn.hasRefreshToken ? "text-success" : "text-warning"}>
                  {ebayConn.hasRefreshToken ? "Connected" : "App configured, not authorized"}
                </span></p>
                <p className="text-xs text-muted-foreground mt-1">Environment: {ebayConn.environment}</p>
                <p className="text-xs text-muted-foreground">Redirect: <span className="font-mono">{ebayConn.redirectUri}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No eBay app credentials configured yet.</p>
            )}

            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-semibold">eBay app credentials</h3>
              <div>
                <Label>Environment</Label>
                <select value={ebayForm.environment}
                  onChange={(e) => setEbayForm({ ...ebayForm, environment: e.target.value })}
                  className="mt-1 flex h-9 w-40 rounded-md border border-input bg-secondary px-3 py-2 text-sm">
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </div>
              <div>
                <Label>Client ID (App ID)</Label>
                <Input value={ebayForm.clientId} onChange={(e) => setEbayForm({ ...ebayForm, clientId: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Client Secret</Label>
                <Input type="password" value={ebayForm.clientSecret} onChange={(e) => setEbayForm({ ...ebayForm, clientSecret: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Dev ID</Label>
                <Input value={ebayForm.devId} onChange={(e) => setEbayForm({ ...ebayForm, devId: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Redirect URI (must match what&apos;s registered in eBay developer portal)</Label>
                <Input value={ebayForm.redirectUri} onChange={(e) => setEbayForm({ ...ebayForm, redirectUri: e.target.value })}
                  placeholder="https://imagegen.bowshai.com/api/channels/ebay/callback"
                  className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveEbayCreds}>Save app credentials</Button>
                {ebayConn?.connected && (
                  <a href="/api/channels/ebay/authorize">
                    <Button variant="outline">Connect eBay account</Button>
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
