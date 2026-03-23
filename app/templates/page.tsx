"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface TemplateVariable {
  id: string
  name: string
  displayName: string
  type: "TEXT" | "DROPDOWN" | "AUTO"
}

interface Template {
  id: string
  name: string
  description: string | null
  promptText: string
  category: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  variables: TemplateVariable[]
  _count: {
    usageHistory: number
  }
}

interface Product {
  id: string
  title: string
  asin?: string
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [showProductSelector, setShowProductSelector] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const response = await fetch("/api/templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}/duplicate`, {
        method: "POST"
      })
      if (response.ok) {
        const newTemplate = await response.json()
        setTemplates(prev => [newTemplate, ...prev])
      }
    } catch (error) {
      console.error("Error duplicating template:", error)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      })
      if (response.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
      }
    } catch (error) {
      console.error("Error deleting template:", error)
    }
  }

  const handleUseTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setShowProductSelector(true)
    loadProducts()
  }

  const loadProducts = async () => {
    setProductsLoading(true)
    try {
      const response = await fetch("/api/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setProductsLoading(false)
    }
  }

  const handleProductSelect = (productId: string) => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId)
      if (template) {
        // Navigate to generate page with template ID
        const category = template.category === "both" ? "image" : template.category
        router.push(`/products/${productId}/generate${category === "video" ? "-video" : ""}?templateId=${selectedTemplateId}`)
      }
    }
  }

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.asin && p.asin.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      image: "bg-primary/20 text-primary",
      video: "bg-primary/20 text-primary",
      both: "bg-success/20 text-success"
    }
    return colors[category] || "bg-muted text-muted-foreground"
  }

  const getVariableTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      TEXT: "bg-muted text-muted-foreground",
      DROPDOWN: "bg-warning/20 text-warning",
      AUTO: "bg-cyan-500/20 text-cyan-400"
    }
    return colors[type] || "bg-muted text-muted-foreground"
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading templates...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">Prompt Templates</h1>
          <Button asChild>
            <Link href="/templates/new">
              + Create Template
            </Link>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-background border border-input rounded-lg px-4 py-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="all">All Categories</option>
                  <option value="image">Image Only</option>
                  <option value="video">Video Only</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <Card className="p-12 text-center">
            <CardContent className="p-0">
              <div className="text-muted-foreground text-6xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-muted-foreground mb-2">No templates yet</h2>
              <p className="text-muted-foreground mb-6">
                Create your first prompt template with dynamic variables
              </p>
              <Button asChild>
                <Link href="/templates/new">
                  Create Your First Template
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-foreground text-lg">{template.name}</h3>
                    <Badge className={getCategoryBadge(template.category)}>
                      {template.category}
                    </Badge>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{template.description}</p>
                  )}

                  {/* Prompt Preview */}
                  <div className="bg-background rounded p-3 mb-4">
                    <p className="text-xs text-muted-foreground font-mono line-clamp-3">
                      {template.promptText}
                    </p>
                  </div>

                  {/* Variables */}
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">
                      {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.slice(0, 4).map((v) => (
                        <Badge
                          key={v.id}
                          variant="secondary"
                          className={getVariableTypeBadge(v.type)}
                        >
                          {v.displayName}
                        </Badge>
                      ))}
                      {template.variables.length > 4 && (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          +{template.variables.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <p className="text-xs text-muted-foreground mb-4">
                    Used {template._count.usageHistory} time{template._count.usageHistory !== 1 ? "s" : ""}
                  </p>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-4 border-t border-border">
                    <Button
                      onClick={() => handleUseTemplate(template.id)}
                      className="w-full"
                    >
                      Use Template
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" asChild className="flex-1">
                        <Link href={`/templates/${template.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDuplicate(template.id)}
                        className="flex-1"
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleDelete(template.id, template.name)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-primary/10 border border-primary/30 rounded-lg p-4">
          <h3 className="font-semibold text-primary mb-2">About Prompt Templates</h3>
          <ul className="list-disc list-inside text-sm text-primary space-y-1">
            <li>Create reusable prompts with dynamic variables like {"{{item_name}}"} or {"{{style}}"}</li>
            <li>Variables can be text inputs, dropdown selections, or auto-filled from product data</li>
            <li>Use templates during image/video generation to quickly create consistent prompts</li>
          </ul>
        </div>
      </div>

      {/* Product Selector Modal */}
      {showProductSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-border">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-foreground">Select a Product</h2>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowProductSelector(false)
                    setSelectedTemplateId(null)
                    setProductSearch("")
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Choose a product to generate images/videos with this template
              </p>
            </div>
            <div className="p-6 flex-1 overflow-hidden flex flex-col">
              <Input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="mb-4"
              />
              <div className="flex-1 overflow-y-auto">
                {productsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-muted-foreground">Loading products...</p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No products found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product.id)}
                        className="w-full text-left p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/10 transition"
                      >
                        <h3 className="font-semibold text-foreground">{product.title}</h3>
                        {product.asin && (
                          <p className="text-sm text-muted-foreground mt-1">ASIN: {product.asin}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  )
}
