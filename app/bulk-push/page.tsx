"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import DashboardLayout from "@/app/components/DashboardLayout"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

// ==================== Interfaces ====================

interface GeneratedImage {
  id: string
  fileName: string
  filePath: string
  status: string
  amazonSlot?: string | null
  amazonPushedAt?: string | null
  amazonPushStatus?: string | null
  templateName?: string | null
  imageType?: { name: string } | null
  template?: { name: string } | null
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  metadata?: any
  images: GeneratedImage[]
  _count: {
    images: number
    sourceImages: number
  }
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
  promptUsed: string | null
  productIds: string[]
  createdAt: string
}

// Slot assignment per product: productId -> { imageId -> slot }
type SlotAssignments = Record<string, Map<string, string>>

// Upload tab types
interface UploadedImage {
  id: string
  fileName: string
  previewUrl: string
  publicUrl: string | null
  uploading: boolean
  error: string | null
  asin: string
  amazonSlot: string
}

// Excel tab types
interface ExcelRow {
  asin: string
  slots: Record<string, string> // slot -> imageUrl
  valid: boolean
  error?: string
  existsInDb?: boolean
}

// ==================== Constants ====================

const AMAZON_SLOTS = [
  { value: 'MAIN', label: 'Main Image' },
  { value: 'PT01', label: 'PT01' },
  { value: 'PT02', label: 'PT02' },
  { value: 'PT03', label: 'PT03' },
  { value: 'PT04', label: 'PT04' },
  { value: 'PT05', label: 'PT05' },
  { value: 'PT06', label: 'PT06' },
  { value: 'PT07', label: 'PT07' },
  { value: 'PT08', label: 'PT08' },
]

const getImageUrl = (image: GeneratedImage) => {
  if (image.filePath?.startsWith('http')) {
    try {
      const url = new URL(image.filePath)
      const key = url.pathname.substring(1)
      return `/api/s3-proxy?key=${encodeURIComponent(key)}`
    } catch {
      return image.filePath
    }
  }
  return `/api/uploads/${image.fileName}`
}

const getImageName = (image: GeneratedImage) => {
  return image.templateName || image.template?.name || image.imageType?.name || image.fileName
}

// ==================== Main Component ====================

export default function BulkPushPage() {
  // Tab state - 4 tabs: from-app, upload, excel, history
  const [activeTab, setActiveTab] = useState<"from-app" | "upload" | "excel" | "history">("from-app")

  // ==================== FROM APP state (existing) ====================
  const [step, setStep] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [slotAssignments, setSlotAssignments] = useState<SlotAssignments>({})
  const [activeProductId, setActiveProductId] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // ==================== UPLOAD state (new) ====================
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [urlInput, setUrlInput] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadJob, setUploadJob] = useState<Job | null>(null)
  const [uploadPushing, setUploadPushing] = useState(false)

  // ==================== EXCEL state (new) ====================
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([])
  const [excelFileName, setExcelFileName] = useState<string | null>(null)
  const [excelValidating, setExcelValidating] = useState(false)
  const [excelJob, setExcelJob] = useState<Job | null>(null)
  const [excelPushing, setExcelPushing] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // ==================== HISTORY state ====================
  const [historyJobs, setHistoryJobs] = useState<Job[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)

  // ==================== Effects ====================

  useEffect(() => {
    loadProducts()
  }, [])

  // Poll any active job
  const activeJob = job || uploadJob || excelJob
  useEffect(() => {
    if (!activeJob || activeJob.status === "COMPLETED" || activeJob.status === "FAILED" || activeJob.status === "CANCELLED") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJob.id}`)
        if (res.ok) {
          const updatedJob = await res.json()
          if (job?.id === activeJob.id) setJob(updatedJob)
          if (uploadJob?.id === activeJob.id) setUploadJob(updatedJob)
          if (excelJob?.id === activeJob.id) setExcelJob(updatedJob)
          if (updatedJob.status === "COMPLETED" || updatedJob.status === "FAILED") {
            setPushing(false)
            setUploadPushing(false)
            setExcelPushing(false)
            setActiveTab("history")
            loadHistory(1)
          }
        }
      } catch {}
    }, 2000)

    return () => clearInterval(interval)
  }, [activeJob, job, uploadJob, excelJob])

  useEffect(() => {
    if (activeTab === "history" && historyJobs.length === 0) {
      loadHistory(1)
    }
  }, [activeTab])

  // ==================== Data loading ====================

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/products")
      if (res.ok) setProducts(await res.json())
    } catch (error) {
      console.error("Error loading products:", error)
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
        const pushJobs = data.jobs.filter((j: any) => {
          try {
            const meta = JSON.parse(j.promptUsed || '{}')
            return meta.jobType === 'amazon-push' || meta.jobType === 'amazon-external-push'
          } catch { return false }
        })
        setHistoryJobs(pushJobs)
        setHistoryPage(data.page)
        setHistoryTotalPages(data.totalPages)
      }
    } catch (error) {
      console.error("Error loading history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }

  // ==================== FROM APP helpers ====================

  const eligibleProducts = products.filter(p =>
    p.asin && p.asin.trim() !== "" &&
    p.images.some(img => img.status === 'APPROVED')
  )

  const filteredProducts = eligibleProducts.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.asin && p.asin.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const toggleProduct = (productId: string) => {
    const next = new Set(selectedProducts)
    if (next.has(productId)) {
      next.delete(productId)
      const newAssignments = { ...slotAssignments }
      delete newAssignments[productId]
      setSlotAssignments(newAssignments)
    } else {
      next.add(productId)
    }
    setSelectedProducts(next)
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts(new Set())
      setSlotAssignments({})
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    }
  }

  const selectedProductsList = eligibleProducts.filter(p => selectedProducts.has(p.id))

  const handleSlotChange = (productId: string, imageId: string, slot: string) => {
    const newAssignments = { ...slotAssignments }
    if (!newAssignments[productId]) newAssignments[productId] = new Map()
    const productMap = new Map(newAssignments[productId])
    if (slot === '') {
      productMap.delete(imageId)
    } else {
      for (const [id, s] of productMap.entries()) {
        if (s === slot && id !== imageId) productMap.delete(id)
      }
      productMap.set(imageId, slot)
    }
    newAssignments[productId] = productMap
    setSlotAssignments(newAssignments)
  }

  const autoAssignSlots = (productId: string) => {
    const product = eligibleProducts.find(p => p.id === productId)
    if (!product) return
    const approvedImages = product.images.filter(img => img.status === 'APPROVED')
    const newAssignments = { ...slotAssignments }
    const productMap = new Map<string, string>()
    const usedSlots = new Set<string>()
    const allSlots = AMAZON_SLOTS.map(s => s.value)

    const withPrevSlot = approvedImages.filter(img => img.amazonSlot)
    const withoutPrevSlot = approvedImages.filter(img => !img.amazonSlot)

    for (const img of withPrevSlot) {
      if (img.amazonSlot && !usedSlots.has(img.amazonSlot)) {
        productMap.set(img.id, img.amazonSlot)
        usedSlots.add(img.amazonSlot)
      }
    }
    for (const img of withoutPrevSlot) {
      const nextSlot = allSlots.find(s => !usedSlots.has(s))
      if (nextSlot) { productMap.set(img.id, nextSlot); usedSlots.add(nextSlot) }
    }
    for (const img of withPrevSlot) {
      if (!productMap.has(img.id)) {
        const nextSlot = allSlots.find(s => !usedSlots.has(s))
        if (nextSlot) { productMap.set(img.id, nextSlot); usedSlots.add(nextSlot) }
      }
    }
    newAssignments[productId] = productMap
    setSlotAssignments(newAssignments)
  }

  const autoAssignAll = () => {
    selectedProductsList.forEach(p => autoAssignSlots(p.id))
  }

  const getTotalAssigned = useCallback(() => {
    let total = 0
    for (const [productId, map] of Object.entries(slotAssignments)) {
      if (selectedProducts.has(productId)) total += map.size
    }
    return total
  }, [slotAssignments, selectedProducts])

  const getProductsWithAssignments = useCallback(() => {
    let count = 0
    for (const [productId, map] of Object.entries(slotAssignments)) {
      if (selectedProducts.has(productId) && map.size > 0) count++
    }
    return count
  }, [slotAssignments, selectedProducts])

  const handleFromAppPush = async () => {
    setShowConfirm(false)
    setPushing(true)
    setJob(null)
    try {
      const pushProducts = []
      for (const [productId, map] of Object.entries(slotAssignments)) {
        if (!selectedProducts.has(productId) || map.size === 0) continue
        pushProducts.push({
          productId,
          images: Array.from(map.entries()).map(([generatedImageId, amazonSlot]) => ({ generatedImageId, amazonSlot }))
        })
      }
      const res = await fetch('/api/amazon/bulk-push-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: pushProducts })
      })
      if (res.ok) {
        const data = await res.json()
        const jobRes = await fetch(`/api/jobs/${data.jobId}`)
        if (jobRes.ok) setJob(await jobRes.json())
      } else {
        const err = await res.json()
        alert("Failed to start bulk push: " + (err.error || "Unknown error"))
        setPushing(false)
      }
    } catch (error) {
      console.error("Error starting bulk push:", error)
      alert("Failed to start bulk push")
      setPushing(false)
    }
  }

  // ==================== UPLOAD tab helpers ====================

  const handleFileDrop = async (files: FileList) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/tiff", "image/gif", "image/webp"]
    const newImages: UploadedImage[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!allowedTypes.includes(file.type)) continue
      if (file.size > 10 * 1024 * 1024) continue

      const id = `upload-${Date.now()}-${i}`
      const previewUrl = URL.createObjectURL(file)
      newImages.push({
        id, fileName: file.name, previewUrl, publicUrl: null,
        uploading: true, error: null, asin: '', amazonSlot: ''
      })
    }

    setUploadedImages(prev => [...prev, ...newImages])

    // Upload each file to S3
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) continue

      const imgId = newImages[i]?.id
      if (!imgId) continue

      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await fetch('/api/amazon/upload-external-image', { method: 'POST', body: formData })
        const data = await res.json()

        setUploadedImages(prev => prev.map(img =>
          img.id === imgId
            ? { ...img, uploading: false, publicUrl: data.success ? data.publicUrl : null, error: data.success ? null : data.error }
            : img
        ))
      } catch (err) {
        setUploadedImages(prev => prev.map(img =>
          img.id === imgId ? { ...img, uploading: false, error: 'Upload failed' } : img
        ))
      }
    }
  }

  const handleAddUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    try { new URL(url) } catch { alert("Invalid URL"); return }

    const id = `url-${Date.now()}`
    setUploadedImages(prev => [...prev, {
      id, fileName: url.split('/').pop() || 'image', previewUrl: url,
      publicUrl: url, uploading: false, error: null, asin: '', amazonSlot: ''
    }])
    setUrlInput("")
  }

  const removeUploadedImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id))
  }

  const updateUploadedImage = (id: string, field: 'asin' | 'amazonSlot', value: string) => {
    setUploadedImages(prev => prev.map(img =>
      img.id === id ? { ...img, [field]: value } : img
    ))
  }

  const readyToUploadPush = uploadedImages.filter(img => img.publicUrl && img.asin && img.amazonSlot && !img.error)

  const handleUploadPush = async () => {
    if (readyToUploadPush.length === 0) return
    setUploadPushing(true)
    setUploadJob(null)

    try {
      const images = readyToUploadPush.map(img => ({
        asin: img.asin,
        amazonSlot: img.amazonSlot,
        imageUrl: img.publicUrl!
      }))

      const res = await fetch('/api/amazon/push-external-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      })

      if (res.ok) {
        const data = await res.json()
        const jobRes = await fetch(`/api/jobs/${data.jobId}`)
        if (jobRes.ok) setUploadJob(await jobRes.json())
      } else {
        const err = await res.json()
        alert("Failed to start push: " + (err.error || "Unknown error"))
        setUploadPushing(false)
      }
    } catch {
      alert("Failed to start push")
      setUploadPushing(false)
    }
  }

  // ==================== EXCEL tab helpers ====================

  const handleExcelUpload = async (file: File) => {
    setExcelFileName(file.name)
    setExcelValidating(true)
    setExcelRows([])

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })

      if (data.length === 0) {
        setExcelValidating(false)
        return
      }

      // Parse rows
      const rows: ExcelRow[] = data.map(row => {
        const asin = (row['ASIN'] || row['asin'] || '').trim()
        const slots: Record<string, string> = {}

        for (const slot of AMAZON_SLOTS) {
          const val = (row[slot.value] || row[slot.label] || '').trim()
          if (val) slots[slot.value] = val
        }

        const valid = Boolean(asin) && Object.keys(slots).length > 0
        const error = !asin ? 'Missing ASIN' : Object.keys(slots).length === 0 ? 'No image URLs' : undefined

        return { asin, slots, valid, error }
      })

      // Validate ASINs against database
      const asins = [...new Set(rows.map(r => r.asin).filter(Boolean))]
      const existingProducts = products.filter(p => p.asin && asins.includes(p.asin))
      const existingAsins = new Set(existingProducts.map(p => p.asin))

      for (const row of rows) {
        if (row.asin) {
          row.existsInDb = existingAsins.has(row.asin)
        }
      }

      setExcelRows(rows)
    } catch (error) {
      console.error("Error parsing Excel:", error)
      alert("Failed to parse file. Ensure it's a valid CSV or XLSX.")
    } finally {
      setExcelValidating(false)
    }
  }

  const validExcelRows = excelRows.filter(r => r.valid)

  const handleExcelPush = async () => {
    if (validExcelRows.length === 0) return
    setExcelPushing(true)
    setExcelJob(null)

    try {
      const images: Array<{ asin: string; amazonSlot: string; imageUrl: string }> = []
      for (const row of validExcelRows) {
        for (const [slot, url] of Object.entries(row.slots)) {
          images.push({ asin: row.asin, amazonSlot: slot, imageUrl: url })
        }
      }

      const res = await fetch('/api/amazon/push-external-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      })

      if (res.ok) {
        const data = await res.json()
        const jobRes = await fetch(`/api/jobs/${data.jobId}`)
        if (jobRes.ok) setExcelJob(await jobRes.json())
      } else {
        const err = await res.json()
        alert("Failed to start push: " + (err.error || "Unknown error"))
        setExcelPushing(false)
      }
    } catch {
      alert("Failed to start push")
      setExcelPushing(false)
    }
  }

  // ==================== Format helpers ====================

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

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
      case "PROCESSING": return "bg-warning/20 text-warning"
      case "QUEUED": return "bg-muted text-muted-foreground"
      default: return "bg-muted text-muted-foreground"
    }
  }

  // ==================== Loading state ====================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading products...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const totalAssigned = getTotalAssigned()
  const productsWithAssignments = getProductsWithAssignments()

  // ==================== Render ====================

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <svg className="w-7 h-7 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Bulk Push to Amazon
        </h1>
      </div>

      {/* Tab Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex gap-1 border-b border-border">
          {[
            { key: "from-app" as const, label: "From App" },
            { key: "upload" as const, label: "Upload & Push" },
            { key: "excel" as const, label: "Excel Import" },
            { key: "history" as const, label: "History" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? "border-warning text-warning"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== FROM APP TAB ==================== */}
      {activeTab === "from-app" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (s === 1) setStep(1)
                    else if (s === 2 && selectedProducts.size > 0) setStep(2)
                    else if (s === 3 && totalAssigned > 0) setStep(3)
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold transition ${
                    step === s ? "bg-warning text-white"
                      : step > s ? "bg-success/20 text-success cursor-pointer"
                      : "bg-accent text-muted-foreground"
                  }`}
                >
                  {step > s ? "\u2713" : s}
                </button>
                <span className={step === s ? "text-warning" : step > s ? "text-success" : "text-muted-foreground"}>
                  {s === 1 ? "Select Products" : s === 2 ? "Assign Slots" : "Review & Push"}
                </span>
                {s < 3 && <div className={`w-8 h-px ${step > s ? "bg-success/50" : "bg-accent"}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Products */}
          {step === 1 && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Step 1: Select Products</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Choose products with approved images to push to Amazon.
                {selectedProducts.size > 0 && <span className="text-warning ml-2">{selectedProducts.size} selected</span>}
              </p>

              {eligibleProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No eligible products. Products need an ASIN and at least one approved image.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <Input
                      type="text"
                      placeholder="Search by title or ASIN..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-border rounded-lg">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-card sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                            <input type="checkbox" checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0} onChange={toggleSelectAll} className="w-4 h-4 text-orange-500 border-input rounded bg-accent" />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">ASIN</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Approved</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Last Pushed</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {filteredProducts.map(product => {
                          const approvedCount = product.images.filter(img => img.status === 'APPROVED').length
                          const lastPushed = product.images.filter(img => img.amazonPushedAt).sort((a, b) => new Date(b.amazonPushedAt!).getTime() - new Date(a.amazonPushedAt!).getTime())[0]
                          return (
                            <tr key={product.id} className={`hover:bg-accent cursor-pointer ${selectedProducts.has(product.id) ? "bg-warning/10" : ""}`} onClick={() => toggleProduct(product.id)}>
                              <td className="px-4 py-3"><input type="checkbox" checked={selectedProducts.has(product.id)} onChange={() => {}} className="w-4 h-4 text-orange-500 border-input rounded bg-accent" /></td>
                              <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{product.title}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{product.asin || "-"}</td>
                              <td className="px-4 py-3"><span className="px-2 py-0.5 bg-success/20 text-success text-xs rounded font-medium">{approvedCount}</span></td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{lastPushed?.amazonPushedAt ? new Date(lastPushed.amazonPushedAt).toLocaleDateString() : "Never"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedProducts(new Set(filteredProducts.map(p => p.id)))} className="px-3 py-1 text-sm text-warning hover:bg-warning/10 rounded">Select All ({filteredProducts.length})</button>
                      <button onClick={() => { setSelectedProducts(new Set()); setSlotAssignments({}) }} className="px-3 py-1 text-sm text-muted-foreground hover:bg-accent rounded">Deselect All</button>
                    </div>
                    {selectedProducts.size > 0 && (
                      <button onClick={() => setStep(2)} className="px-6 py-2 bg-warning text-white rounded-lg hover:bg-warning transition font-medium">
                        Next: Assign Slots ({selectedProducts.size} products)
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Assign Slots */}
          {step === 2 && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Step 2: Assign Image Slots</h2>
                  <p className="text-sm text-muted-foreground mt-1">Assign each image to an Amazon slot (MAIN, PT01-PT08).</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={autoAssignAll} size="sm" variant="secondary">Auto-Assign All</Button>
                  <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg transition">Back</button>
                </div>
              </div>

              <div className="flex gap-4">
                {/* Product sidebar */}
                <div className="w-64 shrink-0 border-r border-border pr-4 max-h-[600px] overflow-y-auto">
                  <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Products ({selectedProductsList.length})</p>
                  {selectedProductsList.map(product => {
                    const assignedCount = slotAssignments[product.id]?.size || 0
                    const approvedCount = product.images.filter(img => img.status === 'APPROVED').length
                    const isActive = activeProductId === product.id
                    return (
                      <button key={product.id} onClick={() => setActiveProductId(product.id)}
                        className={`w-full text-left p-3 rounded-lg mb-1 transition ${isActive ? "bg-warning/20 border border-warning/50" : "hover:bg-accent border border-transparent"}`}>
                        <p className={`text-sm font-medium truncate ${isActive ? "text-warning" : "text-foreground"}`}>{product.asin || product.title.substring(0, 15)}</p>
                        <p className="text-xs text-muted-foreground truncate">{product.title}</p>
                        <span className={`text-xs ${assignedCount > 0 ? "text-success" : "text-muted-foreground"}`}>{assignedCount}/{approvedCount} assigned</span>
                      </button>
                    )
                  })}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {!activeProductId ? (
                    <div className="text-center py-16"><p className="text-muted-foreground">Select a product from the sidebar</p></div>
                  ) : (() => {
                    const product = eligibleProducts.find(p => p.id === activeProductId)
                    if (!product) return null
                    const approvedImages = product.images.filter(img => img.status === 'APPROVED')
                    const productAssignments = slotAssignments[activeProductId] || new Map()

                    return (
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <h3 className="text-base font-semibold text-foreground">{product.title}</h3>
                            <p className="text-sm text-muted-foreground">ASIN: <span className="font-mono">{product.asin}</span></p>
                          </div>
                          <Button onClick={() => autoAssignSlots(activeProductId)} size="sm" variant="outline" className="text-primary">Auto-Assign</Button>
                        </div>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {approvedImages.map(image => {
                            const selectedSlot = productAssignments.get(image.id) || ''
                            const isAssigned = selectedSlot !== ''
                            return (
                              <div key={image.id} className={`flex items-center gap-4 p-3 border rounded-lg transition ${isAssigned ? "border-warning/50 bg-warning/5" : "border-border hover:border-input"}`}>
                                <div className="w-16 h-16 bg-accent rounded overflow-hidden shrink-0">
                                  <img src={getImageUrl(image)} alt={getImageName(image)} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-foreground text-sm truncate">{getImageName(image)}</p>
                                  {image.amazonPushStatus === 'SUCCESS' && <span className="inline-flex items-center text-xs text-success mt-1">On Amazon</span>}
                                </div>
                                <select value={selectedSlot} onChange={(e) => handleSlotChange(activeProductId, image.id, e.target.value)}
                                  className={`border rounded-lg px-3 py-2 text-sm min-w-[140px] bg-background text-foreground ${isAssigned ? "border-warning" : "border-input"}`}>
                                  <option value="">Select slot...</option>
                                  {AMAZON_SLOTS.map(slot => {
                                    const isUsedByOther = Array.from(productAssignments.entries()).some(([id, s]) => s === slot.value && id !== image.id)
                                    return <option key={slot.value} value={slot.value} disabled={isUsedByOther}>{slot.label} {isUsedByOther ? "(assigned)" : ""}</option>
                                  })}
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {totalAssigned === 0 ? "No images assigned yet" : <span className="text-warning font-medium">{totalAssigned} image{totalAssigned !== 1 ? "s" : ""} across {productsWithAssignments} product{productsWithAssignments !== 1 ? "s" : ""}</span>}
                </p>
                {totalAssigned > 0 && <button onClick={() => setStep(3)} className="px-6 py-2 bg-warning text-white rounded-lg hover:bg-warning transition font-medium">Next: Review & Push</button>}
              </div>
            </div>
          )}

          {/* Step 3: Review & Push */}
          {step === 3 && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Step 3: Review & Push</h2>
                  <p className="text-sm text-muted-foreground mt-1">Review your image assignments before pushing to Amazon.</p>
                </div>
                <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg transition">Back</button>
              </div>

              <div className="bg-background rounded-lg p-4 mb-6">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-muted-foreground">Products</p><p className="font-semibold text-foreground text-xl">{productsWithAssignments}</p></div>
                  <div><p className="text-muted-foreground">Total Images</p><p className="font-semibold text-warning text-xl">{totalAssigned}</p></div>
                  <div><p className="text-muted-foreground">Estimated Time</p><p className="font-semibold text-foreground text-xl">~{Math.ceil(productsWithAssignments * 1.5)}s</p></div>
                </div>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-6">
                {selectedProductsList.map(product => {
                  const assignments = slotAssignments[product.id]
                  if (!assignments || assignments.size === 0) return null
                  return (
                    <div key={product.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-foreground text-sm">{product.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">{product.asin}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs rounded font-medium">{assignments.size} image{assignments.size !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {Array.from(assignments.entries()).map(([imageId, slot]) => {
                          const image = product.images.find(img => img.id === imageId)
                          if (!image) return null
                          return (
                            <div key={imageId} className="flex items-center gap-2 bg-background rounded-lg p-2 border border-border">
                              <div className="w-10 h-10 bg-accent rounded overflow-hidden shrink-0">
                                <img src={getImageUrl(image)} alt={getImageName(image)} className="w-full h-full object-contain" />
                              </div>
                              <div>
                                <Badge variant={slot === 'MAIN' ? 'default' : 'secondary'} className="text-xs">{slot}</Badge>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[120px]">{getImageName(image)}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-center">
                <button onClick={() => setShowConfirm(true)} disabled={pushing || totalAssigned === 0}
                  className={`px-8 py-3 rounded-lg font-semibold text-white transition flex items-center gap-2 ${pushing || totalAssigned === 0 ? "bg-muted cursor-not-allowed" : "bg-warning hover:bg-warning"}`}>
                  {pushing ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Pushing...</>) : `Push ${totalAssigned} Image${totalAssigned !== 1 ? "s" : ""} to Amazon`}
                </button>
              </div>
            </div>
          )}

          {/* Confirmation Modal */}
          {showConfirm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-secondary border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Confirm Push to Amazon</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Push <span className="text-warning font-semibold">{totalAssigned} image{totalAssigned !== 1 ? "s" : ""}</span> across <span className="text-warning font-semibold">{productsWithAssignments} product{productsWithAssignments !== 1 ? "s" : ""}</span> to Amazon?
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg">Cancel</button>
                  <button onClick={handleFromAppPush} className="px-6 py-2 bg-warning text-white rounded-lg hover:bg-warning font-medium">Yes, Push</button>
                </div>
              </div>
            </div>
          )}

          {/* Job Progress (from app) */}
          {job && <JobProgress job={job} />}
        </div>
      )}

      {/* ==================== UPLOAD & PUSH TAB ==================== */}
      {activeTab === "upload" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="bg-card border border-border rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">Upload Images</h2>
            <p className="text-sm text-muted-foreground mb-4">Drag & drop image files or paste image URLs to push to Amazon.</p>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                dragOver ? "border-warning bg-warning/10" : "border-input hover:border-input hover:bg-card"
              }`}
            >
              <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-2 text-muted-foreground font-medium">Drop images here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, TIFF, GIF, WebP - Max 10MB per file</p>
              <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/tiff,image/gif,image/webp" className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleFileDrop(e.target.files); e.target.value = '' }} />
            </div>

            {/* URL Input */}
            <div className="mt-4 flex gap-2">
              <Input
                type="text"
                placeholder="Paste image URL (https://...)..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddUrl() }}
                className="flex-1"
              />
              <Button variant="secondary" onClick={handleAddUrl} disabled={!urlInput.trim()}>
                Add URL
              </Button>
            </div>
          </div>

          {/* Uploaded Images Assignment */}
          {uploadedImages.length > 0 && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Assign to Products ({uploadedImages.length} images)</h2>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {uploadedImages.map(img => (
                  <div key={img.id} className={`flex items-center gap-4 p-3 border rounded-lg ${
                    img.error ? "border-destructive/50 bg-destructive/5" :
                    img.publicUrl && img.asin && img.amazonSlot ? "border-success/50 bg-success/5" :
                    "border-border"
                  }`}>
                    {/* Preview */}
                    <div className="w-16 h-16 bg-accent rounded overflow-hidden shrink-0 relative">
                      <img src={img.previewUrl} alt={img.fileName} className="w-full h-full object-contain" />
                      {img.uploading && <div className="absolute inset-0 bg-background/70 flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-400"></div></div>}
                    </div>

                    {/* File name */}
                    <div className="min-w-0 w-32 shrink-0">
                      <p className="text-sm text-foreground truncate">{img.fileName}</p>
                      {img.error && <p className="text-xs text-destructive">{img.error}</p>}
                      {img.uploading && <p className="text-xs text-warning">Uploading...</p>}
                    </div>

                    {/* ASIN Input */}
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="ASIN (e.g. B0ABC12345)"
                        value={img.asin}
                        onChange={e => updateUploadedImage(img.id, 'asin', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground text-sm font-mono"
                        list="asin-suggestions"
                      />
                    </div>

                    {/* Slot */}
                    <select
                      value={img.amazonSlot}
                      onChange={e => updateUploadedImage(img.id, 'amazonSlot', e.target.value)}
                      className="border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[130px]"
                    >
                      <option value="">Slot...</option>
                      {AMAZON_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>

                    {/* Remove */}
                    <button onClick={() => removeUploadedImage(img.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* ASIN autocomplete datalist */}
              <datalist id="asin-suggestions">
                {products.filter(p => p.asin).map(p => <option key={p.id} value={p.asin!}>{p.title}</option>)}
              </datalist>

              {/* Push button */}
              <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {readyToUploadPush.length === 0 ? "Assign ASIN and slot to each image" : <span className="text-warning font-medium">{readyToUploadPush.length} image{readyToUploadPush.length !== 1 ? "s" : ""} ready to push</span>}
                </p>
                <button onClick={handleUploadPush} disabled={uploadPushing || readyToUploadPush.length === 0}
                  className={`px-6 py-2.5 rounded-lg font-medium text-white transition flex items-center gap-2 ${
                    uploadPushing || readyToUploadPush.length === 0 ? "bg-muted cursor-not-allowed" : "bg-warning hover:bg-warning"
                  }`}>
                  {uploadPushing ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Pushing...</>) : `Push ${readyToUploadPush.length} Image${readyToUploadPush.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}

          {uploadJob && <JobProgress job={uploadJob} />}
        </div>
      )}

      {/* ==================== EXCEL IMPORT TAB ==================== */}
      {activeTab === "excel" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="bg-card border border-border rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">Excel / CSV Import</h2>
            <p className="text-sm text-muted-foreground mb-4">Upload a spreadsheet with ASIN and image URLs to push in bulk.</p>

            {/* Expected format info */}
            <div className="bg-background rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Expected columns:</p>
              <div className="overflow-x-auto">
                <table className="text-xs text-muted-foreground border border-border rounded">
                  <thead>
                    <tr className="bg-card">
                      <th className="px-3 py-2 border-r border-border text-left font-semibold text-muted-foreground">ASIN</th>
                      <th className="px-3 py-2 border-r border-border text-left font-semibold text-muted-foreground">MAIN</th>
                      <th className="px-3 py-2 border-r border-border text-left font-semibold text-muted-foreground">PT01</th>
                      <th className="px-3 py-2 border-r border-border text-left font-semibold text-muted-foreground">PT02</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">... PT08</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-r border-border font-mono">B0ABC12345</td>
                      <td className="px-3 py-2 border-r border-border text-blue-400">https://...main.jpg</td>
                      <td className="px-3 py-2 border-r border-border text-blue-400">https://...pt01.jpg</td>
                      <td className="px-3 py-2 border-r border-border text-muted-foreground">(empty = skip)</td>
                      <td className="px-3 py-2 text-muted-foreground">...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* File upload */}
            <div
              onClick={() => excelInputRef.current?.click()}
              className="border-2 border-dashed border-input rounded-xl p-6 text-center cursor-pointer hover:border-input hover:bg-card transition"
            >
              <svg className="mx-auto h-10 w-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-2 text-muted-foreground font-medium">{excelFileName || "Click to upload CSV or XLSX file"}</p>
              <p className="text-xs text-muted-foreground mt-1">Supported: .csv, .xlsx</p>
              <input ref={excelInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleExcelUpload(e.target.files[0]); e.target.value = '' }} />
            </div>
          </div>

          {/* Validation loading */}
          {excelValidating && (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Parsing and validating...</p>
            </div>
          )}

          {/* Excel preview table */}
          {excelRows.length > 0 && !excelValidating && (
            <div className="bg-card border border-border rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-foreground">Preview ({excelRows.length} rows)</h2>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-success">{validExcelRows.length} valid</span>
                  <span className="text-destructive">{excelRows.length - validExcelRows.length} invalid</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-border rounded-lg">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-card sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">ASIN</th>
                      {AMAZON_SLOTS.map(s => (
                        <th key={s.value} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{s.value}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {excelRows.map((row, i) => (
                      <tr key={i} className={row.valid ? "" : "bg-destructive/5"}>
                        <td className="px-3 py-2">
                          {row.valid ? (
                            <span className="text-success" title={row.existsInDb ? "ASIN found in database" : "ASIN not in database (will still push)"}>
                              {row.existsInDb ? "\u2713" : "\u26A0"}
                            </span>
                          ) : (
                            <span className="text-destructive" title={row.error}>\u2717</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-foreground">{row.asin || <span className="text-destructive">missing</span>}</td>
                        {AMAZON_SLOTS.map(s => (
                          <td key={s.value} className="px-3 py-2 max-w-[150px]">
                            {row.slots[s.value] ? (
                              <span className="text-blue-400 truncate block text-xs" title={row.slots[s.value]}>
                                {row.slots[s.value].substring(0, 30)}...
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Push button */}
              <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  <span className="text-warning font-medium">
                    {validExcelRows.length} row{validExcelRows.length !== 1 ? "s" : ""} with{" "}
                    {validExcelRows.reduce((sum, r) => sum + Object.keys(r.slots).length, 0)} total images
                  </span>
                </p>
                <div className="flex gap-3">
                  <button onClick={() => { setExcelRows([]); setExcelFileName(null) }} className="px-4 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg">Clear</button>
                  <button onClick={handleExcelPush} disabled={excelPushing || validExcelRows.length === 0}
                    className={`px-6 py-2.5 rounded-lg font-medium text-white transition flex items-center gap-2 ${
                      excelPushing || validExcelRows.length === 0 ? "bg-muted cursor-not-allowed" : "bg-warning hover:bg-warning"
                    }`}>
                    {excelPushing ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Pushing...</>) : `Push ${validExcelRows.length} Row${validExcelRows.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {excelJob && <JobProgress job={excelJob} />}
        </div>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === "history" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {historyLoading && historyJobs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg shadow-sm p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading push history...</p>
            </div>
          ) : historyJobs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg shadow-sm p-12 text-center">
              <p className="text-muted-foreground">No push jobs yet. Start a push from any of the other tabs.</p>
              <Button onClick={() => setActiveTab("from-app")} className="mt-4" size="sm">Start New Push</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {historyJobs.map(hJob => (
                  <div key={hJob.id} className="bg-card border border-border rounded-lg shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="outline" className={getStatusBadge(hJob.status)}>{hJob.status}</Badge>
                      <span className="text-sm text-muted-foreground">{formatDate(hJob.createdAt)}</span>
                      {hJob.startedAt && hJob.completedAt && <span className="text-xs text-muted-foreground">Duration: {formatDuration(hJob.startedAt, hJob.completedAt)}</span>}
                      {(() => {
                        try {
                          const meta = JSON.parse(hJob.promptUsed || '{}')
                          return <span className="px-2 py-0.5 text-xs bg-accent text-muted-foreground rounded">{meta.jobType === 'amazon-external-push' ? 'External' : 'From App'}</span>
                        } catch { return null }
                      })()}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-muted-foreground">Products</p><p className="font-medium text-foreground">{hJob.productIds.length}</p></div>
                      <div><p className="text-muted-foreground">Total Images</p><p className="font-medium text-foreground">{hJob.totalImages}</p></div>
                      <div><p className="text-muted-foreground">Completed</p><p className="font-medium text-success">{hJob.completedImages}</p></div>
                      <div><p className="text-muted-foreground">Failed</p><p className={`font-medium ${hJob.failedImages > 0 ? "text-destructive" : "text-muted-foreground"}`}>{hJob.failedImages}</p></div>
                    </div>
                    {hJob.errorLog && (
                      <details className="mt-3">
                        <summary className="text-xs text-destructive cursor-pointer hover:text-destructive">View errors</summary>
                        <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded p-3 max-h-32 overflow-y-auto">
                          {hJob.errorLog.split("\n").map((err, i) => <p key={i} className="text-xs text-destructive">{err}</p>)}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {historyTotalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadHistory(historyPage - 1)} disabled={historyPage <= 1}>Previous</Button>
                  <span className="px-4 py-2 text-sm text-muted-foreground">Page {historyPage} of {historyTotalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => loadHistory(historyPage + 1)} disabled={historyPage >= historyTotalPages}>Next</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}

// ==================== Shared Job Progress Component ====================

function JobProgress({ job }: { job: Job }) {
  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Push Progress</h2>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>{job.completedImages + job.failedImages} / {job.totalImages} processed</span>
          <span>{job.status === "COMPLETED" || job.status === "FAILED" ? job.status : Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100) + "%"}</span>
        </div>
        <div className="w-full bg-accent rounded-full h-3">
          <div className={`h-3 rounded-full transition-all duration-500 ${job.status === "FAILED" ? "bg-destructive" : job.status === "COMPLETED" ? "bg-success" : "bg-warning"}`}
            style={{ width: `${Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-success/10 rounded-lg"><p className="text-2xl font-bold text-success">{job.completedImages}</p><p className="text-sm text-success">Completed</p></div>
        <div className="text-center p-3 bg-destructive/10 rounded-lg"><p className="text-2xl font-bold text-destructive">{job.failedImages}</p><p className="text-sm text-destructive">Failed</p></div>
        <div className="text-center p-3 bg-card rounded-lg"><p className="text-2xl font-bold text-muted-foreground">{job.totalImages - job.completedImages - job.failedImages}</p><p className="text-sm text-muted-foreground">Remaining</p></div>
      </div>

      {job.errorLog && (
        <div className="mt-4">
          <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 max-h-40 overflow-y-auto">
            {job.errorLog.split("\n").map((err, i) => <p key={i} className="text-sm text-destructive">{err}</p>)}
          </div>
        </div>
      )}

      {(job.status === "COMPLETED" || job.status === "FAILED") && (
        <div className={`mt-4 p-4 rounded-lg ${job.status === "COMPLETED" ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
          <p className={`font-semibold ${job.status === "COMPLETED" ? "text-success" : "text-destructive"}`}>
            {job.status === "COMPLETED" ? `Push complete! ${job.completedImages} image${job.completedImages !== 1 ? "s" : ""} pushed successfully.` : "Push finished with errors."}
          </p>
        </div>
      )}
    </div>
  )
}
