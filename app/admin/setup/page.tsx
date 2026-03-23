"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DatabaseStatus {
  initialized: boolean
  counts: {
    users: number
    products: number
    imageTypes: number
  }
}

export default function AdminSetupPage() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/admin/setup-database")
      const data = await res.json()
      setStatus(data)
    } catch (error) {
      setMessage({ type: "error", text: "Failed to fetch database status" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const initializeDatabase = async () => {
    setActionLoading("init")
    setMessage(null)
    try {
      const res = await fetch("/api/admin/setup-database", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: "success", text: "Database initialized successfully!" })
        fetchStatus()
      } else {
        setMessage({ type: "error", text: data.message || data.error || "Failed to initialize" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to initialize database" })
    } finally {
      setActionLoading(null)
    }
  }

  const importAmazonProducts = async () => {
    setActionLoading("import")
    setMessage(null)
    try {
      const res = await fetch("/api/admin/import-amazon-products", { method: "POST" })
      const data = await res.json()
      if (data.success || data.processed > 0) {
        setMessage({
          type: "success",
          text: `Imported ${data.processed || 0} products. Skipped: ${data.skipped || 0}, Errors: ${data.errors || 0}`
        })
        fetchStatus()
      } else {
        setMessage({ type: "error", text: data.error || "Failed to import products" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to import Amazon products" })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-foreground text-xl">Loading...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2"><h1 className="text-2xl font-bold text-foreground">Admin Setup</h1></div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === "success" ? "bg-success/10 border border-success/30 text-success" : "bg-destructive/10 border border-destructive/30 text-destructive"
          }`}>
            {message.text}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Database Status</CardTitle>
          </CardHeader>
          <CardContent>
            {status ? (
              <div className="space-y-2 text-muted-foreground">
                <p>
                  Status:{" "}
                  <span className={status.initialized ? "text-success" : "text-warning"}>
                    {status.initialized ? "Initialized" : "Not Initialized"}
                  </span>
                </p>
                <p>Users: {status.counts.users}</p>
                <p>Products: {status.counts.products}</p>
                <p>Image Types: {status.counts.imageTypes}</p>
              </div>
            ) : (
              <p className="text-destructive">Could not fetch status</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-2">1. Initialize Database</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Creates admin user (admin@example.com / admin123) and default image/video types.
              </p>
              <Button
                onClick={initializeDatabase}
                disabled={actionLoading !== null || status?.initialized}
                variant={status?.initialized ? "secondary" : "default"}
                className={actionLoading === "init" ? "opacity-50" : ""}
              >
                {actionLoading === "init" ? "Initializing..." : status?.initialized ? "Already Initialized" : "Initialize Database"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-2">2. Import Amazon Products</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Fetches your FBA inventory from Amazon and imports products with their images.
                This may take several minutes for large inventories.
              </p>
              <Button
                onClick={importAmazonProducts}
                disabled={actionLoading !== null || !status?.initialized}
                variant={!status?.initialized ? "secondary" : "default"}
                className={`${!status?.initialized ? "" : "bg-success hover:bg-success/90"} ${actionLoading === "import" ? "opacity-50" : ""}`}
              >
                {actionLoading === "import" ? "Importing... (this may take a while)" : "Import Amazon Products"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-2">3. Go to Dashboard</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Once setup is complete, go to the main dashboard to start generating images.
              </p>
              <Button asChild>
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardContent className="p-4">
            <h3 className="text-lg font-medium text-foreground mb-2">Login Credentials</h3>
            <p className="text-muted-foreground text-sm">
              After initialization, use these credentials to login:
            </p>
            <div className="mt-2 font-mono text-sm text-muted-foreground">
              <p>Email: admin@example.com</p>
              <p>Password: admin123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
