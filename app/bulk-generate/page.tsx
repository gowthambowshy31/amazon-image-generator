"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import TemplateSelector, { TemplateSelection } from "@/app/components/TemplateSelector"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface SourceImage {
  id: string
  amazonImageUrl: string
  localFilePath: string | null
  variant: string
  width: number
  height: number
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  sourceImages: SourceImage[]
  metadata?: any
  _count: {
    images: number
    sourceImages: number
  }
}

interface VariantSummary {
  variant: string
  count: number
}

interface Job {
  id: string
  status: string
  totalImages: number
  completedImages: number
  failedImages: number
  errorLog: string | null
  startedAt: string | null
  completedAt: string | null
}

interface HistoryJob {
  id: string
  productIds: string[]
  imageTypeIds: string[]
  templateIds: string[]
  variant: string | null
  promptUsed: string | null
  status: string
  totalImages: number
  completedImages: number
  failedImages: number
  errorLog: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  productNames: string[]
  imageTypeNames: string[]
  templateNames: string[]
}

interface JobImage {
  id: string
  filePath: string
  fileName: string
  status: string
  version: number
  product: { id: string; title: string; asin: string | null }
  imageType?: { id: string; name: string } | null
  template?: { id: string; name: string } | null
  templateName?: string | null
  createdAt: string
}

// Get the display URL for a generated image (handles S3 URLs, absolute server paths, and local paths)
const getImageUrl = (image: JobImage) => {
  if (image.filePath?.startsWith('http')) {
    // S3 URL - extract key and use proxy to avoid CORS/auth issues
    try {
      const url = new URL(image.filePath)
      const key = url.pathname.substring(1) // Remove leading slash
      return `/api/s3-proxy?key=${encodeURIComponent(key)}`
    } catch {
      return image.filePath
    }
  }

  // For absolute server paths (e.g., /home/ubuntu/...) or relative paths,
  // use the fileName to load via the uploads API
  return `/api/uploads/${image.fileName}`
}

export default function BulkGeneratePage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate")

  // Data
  const [products, setProducts] = useState<Product[]>([])
  const [variantSummary, setVariantSummary] = useState<VariantSummary[]>([])

  // Selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectedVariant, setSelectedVariant] = useState<string>("")
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection | null>(null)
  const [customPrompt, setCustomPrompt] = useState<string>("")
  // productId -> base64 data URL of an uploaded close-up reference image (in-memory, throwaway)
  const [referenceImages, setReferenceImages] = useState<Record<string, string>>({})

  // UI state
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [generating, setGenerating] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)

  // History state
  const [historyJobs, setHistoryJobs] = useState<HistoryJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [jobImages, setJobImages] = useState<Record<string, JobImage[]>>({})
  const [jobImagesLoading, setJobImagesLoading] = useState<string | null>(null)
  // Per-image action loading state ("imageId:action")
  const [imageActionLoading, setImageActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  // Poll job status
  useEffect(() => {
    if (!job || job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`)
        if (res.ok) {
          const updatedJob = await res.json()
          setJob(updatedJob)
          if (updatedJob.status === "COMPLETED" || updatedJob.status === "FAILED") {
            setGenerating(false)
            // Auto-switch to history tab and refresh
            setActiveTab("history")
            loadHistory(1)
          }
        }
      } catch {}
    }, 2000)

    return () => clearInterval(interval)
  }, [job])

  // Load history when tab changes
  useEffect(() => {
    if (activeTab === "history" && historyJobs.length === 0) {
      loadHistory(1)
    }
  }, [activeTab])

  const loadData = async () => {
    try {
      const [productsRes, variantsRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/products/variants-summary")
      ])

      if (productsRes.ok) setProducts(await productsRes.json())
      if (variantsRes.ok) {
        const data = await variantsRes.json()
        setVariantSummary(data.variants)
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (page: number) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/jobs?page=${page}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setHistoryJobs(data.jobs)
        setHistoryPage(data.page)
        setHistoryTotalPages(data.totalPages)
      }
    } catch (error) {
      console.error("Error loading job history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleImageAction = async (
    jobId: string,
    image: JobImage,
    action: "smaller" | "bigger" | "regenerate"
  ) => {
    const key = `${image.id}:${action}`
    if (imageActionLoading) return
    setImageActionLoading(key)
    try {
      const url =
        action === "regenerate"
          ? `/api/images/${image.id}/regenerate`
          : `/api/images/${image.id}/resize`
      const body =
        action === "regenerate"
          ? { referenceImageBase64: referenceImages[image.product.id] || undefined }
          : { direction: action }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed: ${err.error || res.statusText}`)
        return
      }
      const newImage: JobImage = await res.json()
      // Insert the new variant into the same job's image list, after the source image
      setJobImages(prev => {
        const list = prev[jobId] || []
        const idx = list.findIndex(i => i.id === image.id)
        const next = [...list]
        if (idx >= 0) next.splice(idx + 1, 0, newImage)
        else next.unshift(newImage)
        return { ...prev, [jobId]: next }
      })
    } catch (e) {
      console.error(e)
      alert("Action failed")
    } finally {
      setImageActionLoading(null)
    }
  }

  const loadJobImages = async (jobId: string) => {
    if (jobImages[jobId]) {
      // Already loaded, just toggle
      setExpandedJobId(expandedJobId === jobId ? null : jobId)
      return
    }

    setJobImagesLoading(jobId)
    setExpandedJobId(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/images`)
      if (res.ok) {
        const data = await res.json()
        setJobImages(prev => ({ ...prev, [jobId]: data.images }))
      }
    } catch (error) {
      console.error("Error loading job images:", error)
    } finally {
      setJobImagesLoading(null)
    }
  }

  const toggleProduct = (productId: string) => {
    const next = new Set(selectedProducts)
    if (next.has(productId)) next.delete(productId)
    else next.add(productId)
    setSelectedProducts(next)
  }

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleReferenceUpload = async (productId: string, file: File) => {
    const dataUrl = await readFileAsDataURL(file)
    setReferenceImages(prev => ({ ...prev, [productId]: dataUrl }))
  }

  const clearReference = (productId: string) => {
    setReferenceImages(prev => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    }
  }

  // Products matching current variant that are selected
  const getEligibleProducts = useCallback(() => {
    if (!selectedVariant) return []
    return products.filter(
      p => selectedProducts.has(p.id) && p.sourceImages.some(img => img.variant === selectedVariant)
    )
  }, [products, selectedProducts, selectedVariant])

  const getMissingProducts = useCallback(() => {
    if (!selectedVariant) return []
    return products.filter(
      p => selectedProducts.has(p.id) && !p.sourceImages.some(img => img.variant === selectedVariant)
    )
  }, [products, selectedProducts, selectedVariant])

  // Get variant counts for selected products only
  const getSelectedVariantCounts = useCallback(() => {
    const counts: Record<string, number> = {}
    products
      .filter(p => selectedProducts.has(p.id))
      .forEach(p => {
        const variants = new Set(p.sourceImages.map(img => img.variant))
        variants.forEach(v => {
          counts[v] = (counts[v] || 0) + 1
        })
      })
    return Object.entries(counts)
      .map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => b.count - a.count)
  }, [products, selectedProducts])

  const handleGenerate = async () => {
    if (selectedProducts.size === 0 || !selectedVariant || !templateSelection) return

    setGenerating(true)
    setJob(null)

    try {
      const renderedPrompt = customPrompt.trim()
        ? templateSelection.renderedPrompt + "\n\n" + customPrompt.trim()
        : templateSelection.renderedPrompt

      // Only include reference images for selected products
      const referenceImagesPayload: Record<string, string> = {}
      for (const pid of selectedProducts) {
        if (referenceImages[pid]) referenceImagesPayload[pid] = referenceImages[pid]
      }

      const res = await fetch("/api/images/bulk-generate-by-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedProducts),
          variant: selectedVariant,
          templateId: templateSelection.templateId,
          renderedPrompt,
          referenceImages: Object.keys(referenceImagesPayload).length > 0 ? referenceImagesPayload : undefined
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSkippedCount(data.skippedProducts || 0)
        // Start polling
        const jobRes = await fetch(`/api/jobs/${data.jobId}`)
        if (jobRes.ok) {
          setJob(await jobRes.json())
        }
      } else {
        const err = await res.json()
        alert("Failed to start bulk generation: " + (err.error || "Unknown error"))
        setGenerating(false)
      }
    } catch (error) {
      console.error("Error starting bulk generation:", error)
      alert("Failed to start bulk generation")
      setGenerating(false)
    }
  }

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.asin && p.asin.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Get preview images for selected variant — show ALL products with the variant, not just selected
  const previewImages = selectedVariant
    ? products
        .filter(p => p.sourceImages.some(i => i.variant === selectedVariant))
        .map(p => {
          const img = p.sourceImages
            .filter(i => i.variant === selectedVariant)
            .reduce((best: SourceImage | null, i) => {
              if (!best) return i
              return (i.width * i.height) > (best.width * best.height) ? i : best
            }, null)
          return img ? { productId: p.id, asin: p.asin, title: p.title, image: img, selected: selectedProducts.has(p.id) } : null
        })
        .filter(Boolean) as { productId: string; asin?: string; title: string; image: SourceImage; selected: boolean }[]
    : []

  const selectedPreviewCount = previewImages.filter(i => i.selected).length

  const eligibleCount = getEligibleProducts().length
  const missingCount = getMissingProducts().length

  // Helper: format date for history
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // Helper: format duration
  const formatDuration = (startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return "-"
    const ms = new Date(endStr).getTime() - new Date(startStr).getTime()
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-success/20 text-success"
      case "FAILED": return "bg-destructive/20 text-destructive"
      case "PROCESSING": return "bg-primary/20 text-primary"
      case "QUEUED": return "bg-muted text-muted-foreground"
      case "CANCELLED": return "bg-warning/20 text-warning"
      default: return "bg-muted text-muted-foreground"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground">Bulk Generate Images</h1>
      </div>

      {/* Tab Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab("generate")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "generate"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
            }`}
          >
            + New Generation
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
            }`}
          >
            Job History
          </button>
        </div>
      </div>

      {/* ==================== GENERATE TAB ==================== */}
      {activeTab === "generate" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* Step 1: Select Products */}
          <div className="bg-card border border-border rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">Step 1: Select Products</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Choose the products you want to generate images for. {selectedProducts.size > 0 && `${selectedProducts.size} selected`}
            </p>

            {/* Search */}
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Search by title or ASIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Product table */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-lg">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-card sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-primary border-input rounded bg-accent"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">ASIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Source Images</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Variants</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredProducts.map(product => {
                    const uniqueVariants = Array.from(new Set(product.sourceImages.map(i => i.variant)))
                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-accent cursor-pointer ${selectedProducts.has(product.id) ? "bg-primary/10" : ""}`}
                        onClick={() => toggleProduct(product.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => {}}
                            className="w-4 h-4 text-primary border-input rounded bg-accent"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{product.title}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{product.asin || "-"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{product._count.sourceImages}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1 flex-wrap">
                            {uniqueVariants.map(v => (
                              <span key={v} className="px-2 py-0.5 bg-accent text-muted-foreground text-xs rounded">
                                {v}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex gap-3">
              <button
                onClick={() => setSelectedProducts(new Set(filteredProducts.map(p => p.id)))}
                className="px-3 py-1 text-sm text-primary hover:bg-primary/90/10 rounded"
              >
                Select All ({filteredProducts.length})
              </button>
              <button
                onClick={() => setSelectedProducts(new Set())}
                className="px-3 py-1 text-sm text-muted-foreground hover:bg-accent rounded"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Step 2: Select Variant */}
          {selectedProducts.size > 0 && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Step 2: Select Image Variant</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Choose which image position to use from each product.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {getSelectedVariantCounts().map(({ variant, count }) => (
                  <button
                    key={variant}
                    onClick={() => setSelectedVariant(variant)}
                    className={`border-2 rounded-lg p-3 text-center transition ${
                      selectedVariant === variant
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-input"
                    }`}
                  >
                    <p className="font-semibold text-foreground">{variant}</p>
                    <p className="text-sm text-muted-foreground">{count}/{selectedProducts.size} products</p>
                  </button>
                ))}
              </div>

              {selectedVariant && missingCount > 0 && (
                <div className="mt-4 bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-sm text-warning">
                    {missingCount} selected product{missingCount !== 1 ? "s" : ""} don&apos;t have a {selectedVariant} image and will be skipped.
                  </p>
                </div>
              )}

              {/* Interactive Preview Grid */}
              {selectedVariant && previewImages.length > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-muted-foreground">
                      Preview: {selectedVariant} images ({selectedPreviewCount} selected of {previewImages.length})
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const variantProductIds = previewImages.map(i => i.productId)
                          const next = new Set(selectedProducts)
                          variantProductIds.forEach(id => next.add(id))
                          setSelectedProducts(next)
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          const variantProductIds = new Set(previewImages.map(i => i.productId))
                          const next = new Set(selectedProducts)
                          variantProductIds.forEach(id => next.delete(id))
                          setSelectedProducts(next)
                        }}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-80 overflow-y-auto">
                    {previewImages.map((item) => {
                      const ref = referenceImages[item.productId]
                      return (
                        <div
                          key={item.productId}
                          className={`relative border-2 rounded p-1 transition-all ${
                            item.selected
                              ? "border-success bg-success/10"
                              : "border-border bg-card hover:border-input"
                          }`}
                        >
                          <div onClick={() => toggleProduct(item.productId)} className="cursor-pointer">
                            <img
                              src={item.image.localFilePath?.startsWith('http') ? item.image.localFilePath : item.image.localFilePath ? `/api${item.image.localFilePath}` : item.image.amazonImageUrl}
                              alt={item.title}
                              className={`w-full h-24 object-contain transition-all ${
                                item.selected ? "" : "opacity-40 grayscale"
                              }`}
                            />
                            <p className="text-xs truncate mt-1 text-muted-foreground">
                              {item.asin || item.title.substring(0, 15)}
                            </p>
                          </div>
                          {item.selected && (
                            <div className="absolute top-0.5 right-0.5 bg-success text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                              &#10003;
                            </div>
                          )}
                          {/* Close-up reference uploader */}
                          <div className="mt-1 pt-1 border-t border-border">
                            {ref ? (
                              <div className="flex items-center gap-1">
                                <img src={ref} alt="close-up" className="w-8 h-8 object-cover rounded border border-border" />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); clearReference(item.productId) }}
                                  className="text-xs text-destructive hover:underline"
                                  title="Remove close-up"
                                >
                                  remove
                                </button>
                              </div>
                            ) : (
                              <label
                                className="flex items-center justify-center text-xs text-primary hover:underline cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                + close-up
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0]
                                    if (f) await handleReferenceUpload(item.productId, f)
                                    e.target.value = ""
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Template */}
          {selectedProducts.size > 0 && selectedVariant && (
            <>
              <TemplateSelector
                category="image"
                mode="single"
                onSelectionChange={(selections) => {
                  setTemplateSelection(selections.length > 0 ? selections[0] : null)
                }}
              />

              {/* Custom Prompt */}
              <div className="bg-card border border-border rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  {templateSelection ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {templateSelection
                    ? "Add any additional instructions to combine with the template prompt."
                    : "Select a template above first, then optionally add extra instructions."
                  }
                </p>
                <Textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder={templateSelection ? "Additional instructions (optional)..." : "Select a template first..."}
                  className="min-h-[100px]"
                />
              </div>
            </>
          )}

          {/* Step 4: Review & Generate */}
          {selectedProducts.size > 0 && selectedVariant && templateSelection && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Review & Generate</h2>

              <div className="bg-background rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Products Selected</p>
                    <p className="font-semibold text-foreground">{selectedProducts.size}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Variant</p>
                    <p className="font-semibold text-foreground">{selectedVariant}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Template</p>
                    <p className="font-semibold text-foreground">
                      {templateSelection.templateName}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Images to Generate</p>
                    <p className="font-semibold text-success">{eligibleCount}</p>
                    {missingCount > 0 && (
                      <p className="text-xs text-warning">{missingCount} will be skipped</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleGenerate}
                  disabled={generating || eligibleCount === 0}
                  className="px-8 py-3 bg-success hover:bg-success/90 text-white font-semibold"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Generating...
                    </span>
                  ) : (
                    `Generate ${eligibleCount} Image${eligibleCount !== 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Job Progress */}
          {job && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Generation Progress</h2>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <span>
                    {job.completedImages + job.failedImages} / {job.totalImages} processed
                  </span>
                  <span>
                    {job.status === "COMPLETED" || job.status === "FAILED"
                      ? job.status
                      : Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100) + "%"
                    }
                  </span>
                </div>
                <div className="w-full bg-accent rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      job.status === "FAILED" ? "bg-destructive" :
                      job.status === "COMPLETED" ? "bg-success" : "bg-primary"
                    }`}
                    style={{ width: `${Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-success/10 rounded-lg">
                  <p className="text-2xl font-bold text-success">{job.completedImages}</p>
                  <p className="text-sm text-success">Completed</p>
                </div>
                <div className="text-center p-3 bg-destructive/10 rounded-lg">
                  <p className="text-2xl font-bold text-destructive">{job.failedImages}</p>
                  <p className="text-sm text-destructive">Failed</p>
                </div>
                <div className="text-center p-3 bg-card rounded-lg">
                  <p className="text-2xl font-bold text-muted-foreground">
                    {job.totalImages - job.completedImages - job.failedImages}
                  </p>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                </div>
              </div>

              {skippedCount > 0 && (
                <p className="text-sm text-warning mb-3">
                  {skippedCount} product{skippedCount !== 1 ? "s" : ""} skipped (missing selected variant)
                </p>
              )}

              {/* Error log */}
              {job.errorLog && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {job.errorLog.split("\n").map((err, i) => (
                      <p key={i} className="text-sm text-destructive">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Done message */}
              {(job.status === "COMPLETED" || job.status === "FAILED") && (
                <div className={`mt-4 p-4 rounded-lg ${job.status === "COMPLETED" ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
                  <p className={`font-semibold ${job.status === "COMPLETED" ? "text-success" : "text-destructive"}`}>
                    {job.status === "COMPLETED"
                      ? `Bulk generation complete! ${job.completedImages} image${job.completedImages !== 1 ? "s" : ""} generated successfully.`
                      : "Bulk generation finished with errors."
                    }
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Switching to Job History tab to view results...
                  </p>
                  {job.status === "COMPLETED" && job.completedImages > 0 && (
                    <Link
                      href="/bulk-push"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-warning text-white text-sm rounded-lg hover:bg-warning transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Push Generated Images to Amazon
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === "history" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {historyLoading && historyJobs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg shadow-sm p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading job history...</p>
            </div>
          ) : historyJobs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg shadow-sm p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-foreground">No generation jobs yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a new bulk generation to see job history here.
              </p>
              <Button
                onClick={() => setActiveTab("generate")}
                className="mt-4"
                size="sm"
              >
                Start New Generation
              </Button>
            </div>
          ) : (
            <>
              {/* Job list */}
              <div className="space-y-4">
                {historyJobs.map(hJob => (
                  <div key={hJob.id} className="bg-card border border-border rounded-lg shadow-sm">
                    {/* Job summary row */}
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant="outline" className={getStatusBadge(hJob.status)}>
                              {hJob.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{formatDate(hJob.createdAt)}</span>
                            {hJob.startedAt && hJob.completedAt && (
                              <span className="text-xs text-muted-foreground">
                                Duration: {formatDuration(hJob.startedAt, hJob.completedAt)}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Variant</p>
                              <p className="font-medium text-foreground">{hJob.variant || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Template</p>
                              <p className="font-medium text-foreground">
                                {(hJob.templateNames && hJob.templateNames[0]) || hJob.imageTypeNames[0] || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Products</p>
                              <p className="font-medium text-foreground">{hJob.productIds.length}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Completed</p>
                              <p className="font-medium text-success">{hJob.completedImages}/{hJob.totalImages}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Failed</p>
                              <p className={`font-medium ${hJob.failedImages > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {hJob.failedImages}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => loadJobImages(hJob.id)}
                          className={`ml-4 px-4 py-2 text-sm rounded-lg transition ${
                            expandedJobId === hJob.id
                              ? "bg-primary/20 text-primary"
                              : "bg-accent text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {expandedJobId === hJob.id ? "Hide Images" : "View Images"}
                        </button>
                      </div>

                      {/* Prompt used */}
                      {hJob.promptUsed && (
                        <details className="mt-3">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-muted-foreground">
                            View prompt used
                          </summary>
                          <pre className="mt-2 text-xs text-muted-foreground bg-background rounded p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {hJob.promptUsed}
                          </pre>
                        </details>
                      )}

                      {/* Error log */}
                      {hJob.errorLog && (
                        <details className="mt-2">
                          <summary className="text-xs text-destructive cursor-pointer hover:text-destructive">
                            View errors ({hJob.failedImages} failed)
                          </summary>
                          <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded p-3 max-h-32 overflow-y-auto">
                            {hJob.errorLog.split("\n").map((err, i) => (
                              <p key={i} className="text-xs text-destructive">{err}</p>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Expanded: Generated images */}
                    {expandedJobId === hJob.id && (
                      <div className="border-t border-border p-5 bg-background">
                        {jobImagesLoading === hJob.id ? (
                          <div className="text-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                            <p className="mt-2 text-sm text-muted-foreground">Loading images...</p>
                          </div>
                        ) : (jobImages[hJob.id] || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No generated images found for this job.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {(jobImages[hJob.id] || []).map(img => {
                              const smallerKey = `${img.id}:smaller`
                              const biggerKey = `${img.id}:bigger`
                              const regenKey = `${img.id}:regenerate`
                              const isSmaller = imageActionLoading === smallerKey
                              const isBigger = imageActionLoading === biggerKey
                              const isRegen = imageActionLoading === regenKey
                              const isAnyLoading = isSmaller || isBigger || isRegen
                              const canAct = img.status === "COMPLETED"
                              return (
                                <div key={img.id} className="border border-border rounded-lg bg-card overflow-hidden hover:shadow-sm transition group">
                                  <Link href={`/products/${img.product.id}`} className="block">
                                    <div className="relative">
                                      <img
                                        src={getImageUrl(img)}
                                        alt={img.fileName}
                                        className="w-full h-32 object-contain bg-card"
                                      />
                                      <span className={`absolute top-1 right-1 px-1.5 py-0.5 text-xs rounded ${
                                        img.status === "COMPLETED" ? "bg-success/20 text-success" :
                                        img.status === "REJECTED" ? "bg-destructive/20 text-destructive" :
                                        "bg-muted text-muted-foreground"
                                      }`}>
                                        {img.status === "COMPLETED" ? "OK" : img.status}
                                      </span>
                                    </div>
                                    <div className="p-2">
                                      <p className="text-xs font-medium text-foreground truncate group-hover:text-primary">
                                        {img.product.asin || img.product.title.substring(0, 20)}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {img.templateName || img.template?.name || img.imageType?.name || "Generated"}
                                      </p>
                                    </div>
                                  </Link>
                                  {canAct && (
                                    <div className="px-2 pb-2 flex gap-1">
                                      <button
                                        type="button"
                                        disabled={isAnyLoading}
                                        onClick={() => handleImageAction(hJob.id, img, "smaller")}
                                        className="flex-1 text-xs px-1 py-1 rounded bg-accent text-foreground hover:bg-muted disabled:opacity-50"
                                        title="Re-render with the product ~15% smaller"
                                      >
                                        {isSmaller ? "…" : "− smaller"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isAnyLoading}
                                        onClick={() => handleImageAction(hJob.id, img, "bigger")}
                                        className="flex-1 text-xs px-1 py-1 rounded bg-accent text-foreground hover:bg-muted disabled:opacity-50"
                                        title="Re-render with the product ~15% bigger"
                                      >
                                        {isBigger ? "…" : "+ bigger"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isAnyLoading}
                                        onClick={() => handleImageAction(hJob.id, img, "regenerate")}
                                        className="flex-1 text-xs px-1 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                                        title="Re-roll with the same source and prompt"
                                      >
                                        {isRegen ? "…" : "↻ regen"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistory(historyPage - 1)}
                    disabled={historyPage <= 1}
                  >
                    Previous
                  </Button>
                  <span className="px-4 py-2 text-sm text-muted-foreground">
                    Page {historyPage} of {historyTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistory(historyPage + 1)}
                    disabled={historyPage >= historyTotalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
