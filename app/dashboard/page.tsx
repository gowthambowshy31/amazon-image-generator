"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  images: any[]
  sourceImages?: any[]
  metadata?: any
  createdAt: string
  _count: {
    images: number
    sourceImages: number
  }
}

interface Analytics {
  imagesGenerated: number
  imagesApproved: number
  imagesRejected: number
  averageIterations?: number
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL")
  const [sourceFilter, setSourceFilter] = useState<string>("ALL")
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [downloadingBulk, setDownloadingBulk] = useState(false)
  const [bulkDownloadType, setBulkDownloadType] = useState<'source' | 'generated' | 'all'>('generated')

  // Toggle selection for a single product
  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(productId)) {
      newSelected.delete(productId)
    } else {
      newSelected.add(productId)
    }
    setSelectedProducts(newSelected)
  }

  // Toggle all visible products
  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    }
  }

  // Download selected products' images
  const downloadSelectedImages = async () => {
    if (selectedProducts.size === 0) return

    setDownloadingBulk(true)
    try {
      const response = await fetch('/api/download/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: Array.from(selectedProducts),
          imageType: bulkDownloadType
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate ZIP file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `products-${bulkDownloadType}-images-${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Bulk download failed:', error)
      alert('Failed to download images')
    } finally {
      setDownloadingBulk(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [productsRes, analyticsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/analytics')
      ])

      if (productsRes.ok) {
        const productsData = await productsRes.json()
        setProducts(productsData)
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        setAnalytics(analyticsData)
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return
    }

    setDeletingProductId(productId)
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        // Remove product from local state
        setProducts(products.filter(p => p.id !== productId))
      } else {
        alert('Failed to delete product. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      alert('Failed to delete product. Please try again.')
    } finally {
      setDeletingProductId(null)
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Helper function to check if product is from Amazon
  const isAmazonProduct = (product: Product) => {
    // Products with ASIN are from Amazon, except "Test product" which is manual
    return product.asin && product.asin.trim() !== "" && product.title !== "Test product"
  }

  // Helper function to check if product is manual entry
  const isManualProduct = (product: Product) => {
    // Manual products are those without ASIN or the "Test product"
    return !product.asin || product.asin.trim() === "" || product.title === "Test product"
  }

  // Helper function to check if product is new (created within last 24 hours)
  const isNewProduct = (product: Product) => {
    const dayInMs = 24 * 60 * 60 * 1000
    const createdTime = new Date(product.createdAt).getTime()
    const now = new Date().getTime()
    return (now - createdTime) < dayInMs
  }

  // Filter and search logic
  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.asin && product.asin.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory = categoryFilter === "ALL" || product.category === categoryFilter

    const matchesSource =
      sourceFilter === "ALL" ||
      (sourceFilter === "AMAZON" && isAmazonProduct(product)) ||
      (sourceFilter === "MANUAL" && isManualProduct(product))

    return matchesSearch && matchesCategory && matchesSource
  })

  // Get unique categories for filter dropdown
  const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))


  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your products and image generation</p>
        </div>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground">Total Products</h3>
              <p className="text-3xl font-bold text-foreground mt-2">{products.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Analytics */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground">Images Generated</h3>
                <p className="text-3xl font-bold text-info mt-2">{analytics.imagesGenerated}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground">Images Approved</h3>
                <p className="text-3xl font-bold text-success mt-2">{analytics.imagesApproved}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground">Images Rejected</h3>
                <p className="text-3xl font-bold text-destructive mt-2">{analytics.imagesRejected}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search and Filter Section */}
        <Card className="mb-6">
          <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search Input */}
            <div>
              <Label htmlFor="search" className="block text-sm font-medium text-foreground mb-2">
                Search Products
              </Label>
              <Input
                type="text"
                id="search"
                placeholder="Search by title or ASIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category Filter */}
            <div>
              <Label htmlFor="category" className="block text-sm font-medium text-foreground mb-2">
                Filter by Category
              </Label>
              <select
                id="category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-foreground"
              >
                <option value="ALL">All Categories</option>
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Source Filter */}
            <div>
              <Label htmlFor="source" className="block text-sm font-medium text-foreground mb-2">
                Filter by Source
              </Label>
              <select
                id="source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-foreground"
              >
                <option value="ALL">All Sources</option>
                <option value="AMAZON">Amazon Import</option>
                <option value="MANUAL">Manual Entry</option>
              </select>
            </div>
          </div>

          {/* Active Filters Display and Clear Button */}
          {(searchTerm || categoryFilter !== "ALL" || sourceFilter !== "ALL") && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Search: &quot;{searchTerm}&quot;
                    <button
                      onClick={() => setSearchTerm("")}
                      className="ml-1 hover:text-primary"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {categoryFilter !== "ALL" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Category: {categoryFilter}
                    <button
                      onClick={() => setCategoryFilter("ALL")}
                      className="ml-1 hover:text-primary"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {sourceFilter !== "ALL" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Source: {sourceFilter === "AMAZON" ? "Amazon Import" : "Manual Entry"}
                    <button
                      onClick={() => setSourceFilter("ALL")}
                      className="ml-1 hover:text-primary"
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("")
                  setCategoryFilter("ALL")
                  setSourceFilter("ALL")
                }}
              >
                Clear All Filters
              </Button>
            </div>
          )}

          {/* Results Count */}
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredProducts.length} of {products.length} products
          </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Products</CardTitle>
            {/* Bulk Download Controls */}
            {selectedProducts.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.size} selected
                </span>
                <select
                  value={bulkDownloadType}
                  onChange={(e) => setBulkDownloadType(e.target.value as 'source' | 'generated' | 'all')}
                  className="flex h-9 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-foreground"
                >
                  <option value="generated">Generated Images</option>
                  <option value="source">Source Images</option>
                  <option value="all">All Images</option>
                </select>
                <Button
                  onClick={downloadSelectedImages}
                  disabled={downloadingBulk}
                  size="sm"
                >
                  {downloadingBulk ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Preparing ZIP...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Selected
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProducts(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded"
                      title="Select all"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Inventory</TableHead>
                  <TableHead>Source Images</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-12 text-center">
                      <div className="text-muted-foreground">
                        <svg
                          className="mx-auto h-12 w-12 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-foreground">No products found</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Try adjusting your search or filter criteria
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                  <TableRow key={product.id} className={`hover:bg-muted/50 ${selectedProducts.has(product.id) ? 'bg-primary/10' : ''}`}>
                    <TableCell className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                        className="w-4 h-4 rounded"
                      />
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{product.title}</div>
                        <div className="flex gap-1">
                          {isAmazonProduct(product) && (
                            <Badge variant="warning">Amazon</Badge>
                          )}
                          {isNewProduct(product) && (
                            <Badge variant="success">NEW</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">{product.asin || '-'}</div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">{product.category || '-'}</div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      <span className="font-semibold text-info">
                        {(product.metadata as any)?.quantity ?? (product.metadata as any)?.inventory?.quantity ?? 0}
                      </span> units
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {product._count.sourceImages} images
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {product._count.images} images
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/products/${product.id}`}>
                            View
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="text-success hover:text-success">
                          <Link href={`/products/${product.id}/generate`}>
                            Generate
                          </Link>
                        </Button>
                        {isManualProduct(product) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                            disabled={deletingProductId === product.id}
                            className="text-destructive hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete product"
                          >
                            {deletingProductId === product.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
