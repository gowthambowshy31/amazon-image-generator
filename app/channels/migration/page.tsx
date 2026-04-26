"use client"

import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ChannelsMigrationPage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk-publish Amazon SKUs as eBay listings.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Migration wizard</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4 py-6">
            <p>The migration flow will:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Group SKUs by parent ASIN where applicable (variation listings)</li>
              <li>Suggest eBay categories from the catalog/taxonomy API</li>
              <li>Collect required item aspects per category</li>
              <li>Create eBay inventory items + offers</li>
              <li>Publish offers and persist eBay item IDs back to channel SKUs</li>
            </ol>
            <p className="pt-2 text-warning">
              Wizard UI is under construction. Migration logic is available via the API
              (see <code>/lib/channels/</code>) and can be invoked directly per SKU/group.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
