"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import AmazonImagePush from "@/app/components/AmazonImagePush"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface SourceImage {
  id: string
  amazonImageUrl: string
  localFilePath: string
  variant: string
  width: number
  height: number
}

interface GeneratedImage {
  id: string
  imageTypeId?: string | null
  templateId?: string | null
  templateName?: string | null
  status: string
  version: number
  fileName: string
  filePath: string
  sourceImageId?: string | null
  parentImageId?: string | null
  imageType?: {
    id: string
    name: string
  } | null
  template?: {
    id: string
    name: string
  } | null
  sourceImage?: {
    id: string
    variant: string
    localFilePath: string
  } | null
  parentImage?: {
    id: string
    fileName: string
    version: number
  } | null
  // Amazon push tracking
  amazonSlot?: string | null
  amazonPushedAt?: string | null
  amazonPushStatus?: string | null
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  metadata?: any
  sourceImages: SourceImage[]
  images: GeneratedImage[]
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [selectedImageForRegeneration, setSelectedImageForRegeneration] = useState<string | null>(null)
  const [regeneratePrompt, setRegeneratePrompt] = useState("")
  const [regenerating, setRegenerating] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [imageView, setImageView] = useState<'grid' | 'table'>('grid')
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [refreshingFromAmazon, setRefreshingFromAmazon] = useState(false)

  // Update image status (approve/reject/unapprove)
  const updateImageStatus = async (imageId: string, status: 'APPROVED' | 'REJECTED' | 'COMPLETED') => {
    setUpdatingStatusId(imageId)
    try {
      const response = await fetch(`/api/images/${imageId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (response.ok) {
        await loadProduct()
      } else {
        const errorData = await response.json()
        alert(`Failed to update status: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // Refresh source images from Amazon
  const refreshFromAmazon = async () => {
    if (!product?.asin) {
      alert('Product has no ASIN - cannot refresh from Amazon')
      return
    }

    setRefreshingFromAmazon(true)
    try {
      const response = await fetch(`/api/products/${params.id}/refresh-images`, {
        method: 'POST'
      })
      const result = await response.json()

      if (response.ok && result.success) {
        await loadProduct()
        alert(`Refreshed ${result.summary?.importedImageCount || 0} images from Amazon`)
      } else {
        alert(`Failed to refresh: ${result.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setRefreshingFromAmazon(false)
    }
  }

  // Download a single image
  const downloadImage = async (imageUrl: string, fileName: string) => {
    try {
      // For relative URLs (internal API routes like /api/uploads or /api/s3-proxy),
      // fetch directly and create a blob download
      if (imageUrl.startsWith('/')) {
        const response = await fetch(imageUrl)
        if (!response.ok) {
          throw new Error('Failed to fetch image')
        }
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        // For external URLs (e.g., Amazon images), use the proxy endpoint to avoid CORS issues
        const proxyUrl = `/api/download/image?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(fileName)}`
        const link = document.createElement('a')
        link.href = proxyUrl
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      console.error('Download failed:', error)
      alert('Failed to download image')
    }
  }

  // Download all generated images as ZIP
  const downloadAllGeneratedImages = async () => {
    if (!product || product.images.length === 0) return

    setDownloadingAll(true)
    try {
      const response = await fetch('/api/download/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageType: 'generated'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate ZIP file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${product.asin || product.id}-generated-images.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download all failed:', error)
      alert('Failed to download images')
    } finally {
      setDownloadingAll(false)
    }
  }

  // Download all source images as ZIP
  const downloadAllSourceImages = async () => {
    if (!product || product.sourceImages.length === 0) return

    setDownloadingAll(true)
    try {
      const response = await fetch('/api/download/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageType: 'source'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate ZIP file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${product.asin || product.id}-source-images.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download all failed:', error)
      alert('Failed to download images')
    } finally {
      setDownloadingAll(false)
    }
  }

  // Get the display URL for a generated image
  const getImageUrl = (image: GeneratedImage) => {
    if (image.filePath?.startsWith('http')) {
      // Extract S3 key from the URL and use proxy to avoid CORS/auth issues
      try {
        const url = new URL(image.filePath)
        const key = url.pathname.substring(1) // Remove leading slash
        return `/api/s3-proxy?key=${encodeURIComponent(key)}`
      } catch {
        return image.filePath
      }
    }
    // Use the dynamic API route to serve uploaded files (Next.js production
    // mode does not serve files added to /public after build time)
    return `/api/uploads/${image.fileName}`
  }

  // Delete a generated image
  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) return

    setDeletingImageId(imageId)
    try {
      const response = await fetch(`/api/images/${imageId}`, { method: 'DELETE' })
      if (response.ok) {
        await loadProduct()
      } else {
        const errorData = await response.json()
        alert(`Failed to delete: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDeletingImageId(null)
    }
  }

  useEffect(() => {
    loadProduct()
  }, [params.id])

  const loadProduct = async () => {
    try {
      const res = await fetch(`/api/products/${params.id}`)

      if (!res.ok) {
        throw new Error('Failed to load product')
      }

      const data = await res.json()
      setProduct(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getImageDisplayName = (image: GeneratedImage) => {
    return image.templateName || image.template?.name || image.imageType?.name || 'Generated Image'
  }

  const openRegenerateModal = (imageId: string, displayName: string) => {
    setSelectedImageForRegeneration(imageId)
    setRegeneratePrompt(`Regenerate ${displayName}`)
    setShowRegenerateModal(true)
  }

  const handleRegenerate = async () => {
    if (!product || !selectedImageForRegeneration) return

    const generatedImage = product.images.find(img => img.id === selectedImageForRegeneration)
    if (!generatedImage) return

    setRegenerating(true)

    try {
      const requestBody: any = {
        productId: product.id,
        parentImageId: selectedImageForRegeneration,
        customPrompt: regeneratePrompt
      }

      // Use templateId if available, otherwise fall back to imageTypeId
      if (generatedImage.templateId) {
        requestBody.templateId = generatedImage.templateId
      } else if (generatedImage.imageTypeId) {
        requestBody.imageTypeId = generatedImage.imageTypeId
      }

      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        setShowRegenerateModal(false)
        setRegeneratePrompt("")
        setSelectedImageForRegeneration(null)
        // Reload product to show new image
        await loadProduct()
        alert('Image regenerated successfully!')
      } else {
        const errorData = await response.json()
        alert(`Failed to regenerate: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading product...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !product) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive mb-4">Error</h2>
            <p className="text-muted-foreground mb-4">{error || 'Product not found'}</p>
            <Button asChild>
              <Link href="/dashboard">
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const inventory = (product.metadata as any)?.inventory?.quantity || 0

  // Filter source images: only keep the largest image per variant
  const filteredSourceImages = (() => {
    if (!product.sourceImages) return []
    const variantMap = new Map<string, SourceImage>()
    for (const img of product.sourceImages) {
      const variant = img.variant || "UNKNOWN"
      const existing = variantMap.get(variant)
      if (!existing || (img.width * img.height) > (existing.width * existing.height)) {
        variantMap.set(variant, img)
      }
    }
    return Array.from(variantMap.values())
  })()

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">Product Details</h1>
          <Button asChild className="bg-success hover:bg-success/90">
            <Link href={`/products/${product.id}/generate`}>
              Generate Images
            </Link>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{product.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">ASIN</p>
                <p className="font-semibold">{product.asin || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="font-semibold">{product.category || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-semibold">{product.status.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inventory</p>
                <p className="font-semibold text-primary">{inventory} units</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Source Images */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">
                Source Images from Amazon ({filteredSourceImages.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Refresh from Amazon Button */}
                {product.asin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshFromAmazon}
                    disabled={refreshingFromAmazon}
                    className="bg-warning text-white hover:bg-warning/90 border-warning"
                  >
                    {refreshingFromAmazon ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh from Amazon
                      </>
                    )}
                  </Button>
                )}
                {/* Download All Button */}
                {filteredSourceImages.length > 0 && (
                  <Button
                    size="sm"
                    onClick={downloadAllSourceImages}
                    disabled={downloadingAll}
                  >
                    {downloadingAll ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download All
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSourceImages.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredSourceImages.map((image) => (
                  <div key={image.id} className="border border-border rounded-lg p-2 hover:shadow-sm bg-card transition group">
                    <div className="relative aspect-square bg-accent rounded">
                      <img
                        src={image.amazonImageUrl}
                        alt={`${product.title} - ${image.variant}`}
                        className="object-contain w-full h-full rounded"
                      />
                      <button
                        onClick={() => downloadImage(image.amazonImageUrl, `${product.asin || product.id}-${image.variant}.jpg`)}
                        className="absolute top-2 right-2 bg-accent text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-opacity-100"
                        title="Download image"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <p className="font-medium">{image.variant}</p>
                      <p>{image.width} x {image.height}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No source images available</p>
            )}
          </CardContent>
        </Card>

        {/* Generated Images */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">
                Generated Images ({product.images?.length || 0})
              </CardTitle>
              {product.images && product.images.length > 0 && (
                <div className="flex items-center gap-3">
                  {/* View Toggle */}
                  <div className="flex items-center border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setImageView('grid')}
                      className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                        imageView === 'grid' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'
                      }`}
                      title="Grid view"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setImageView('table')}
                      className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                        imageView === 'table' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'
                      }`}
                      title="Table view"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                  {/* Download All Button */}
                  <Button
                    size="sm"
                    onClick={downloadAllGeneratedImages}
                    disabled={downloadingAll}
                  >
                    {downloadingAll ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download All
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {product.images && product.images.length > 0 ? (
              imageView === 'grid' ? (
                /* Grid View */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {product.images.map((image) => (
                    <div key={image.id} className="border border-border rounded-lg p-2 hover:shadow-sm bg-card transition group">
                      <div className="relative aspect-square bg-accent rounded">
                        <img
                          src={getImageUrl(image)}
                          alt={`${product.title} - ${getImageDisplayName(image)}`}
                          className="object-contain w-full h-full rounded"
                        />
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDeleteImage(image.id)}
                            disabled={deletingImageId === image.id}
                            title="Delete image"
                          >
                            {deletingImageId === image.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </Button>
                          <button
                            onClick={() => downloadImage(getImageUrl(image), image.fileName)}
                            className="bg-accent text-white p-1.5 rounded hover:bg-opacity-100"
                            title="Download image"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <Button
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => openRegenerateModal(image.id, getImageDisplayName(image))}
                          >
                            Regenerate
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs">
                        <p className="font-medium text-muted-foreground mb-1">{getImageDisplayName(image)}</p>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={
                            image.status === 'APPROVED' ? 'success' :
                            image.status === 'REJECTED' ? 'destructive' :
                            image.status === 'COMPLETED' ? 'warning' :
                            'secondary'
                          }>
                            {image.status}
                          </Badge>
                          {/* Approve/Reject buttons for non-approved images */}
                          {image.status !== 'APPROVED' && (
                            <div className="flex gap-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="h-5 px-2 text-[10px] bg-success hover:bg-success/90"
                                onClick={() => updateImageStatus(image.id, 'APPROVED')}
                                disabled={updatingStatusId === image.id}
                                title="Approve image"
                              >
                                {updatingStatusId === image.id ? '...' : 'Approve'}
                              </Button>
                            </div>
                          )}
                          {image.status === 'APPROVED' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-5 px-2 text-[10px] hover:bg-warning hover:text-white"
                              onClick={() => updateImageStatus(image.id, 'COMPLETED')}
                              disabled={updatingStatusId === image.id}
                              title="Unapprove image"
                            >
                              {updatingStatusId === image.id ? '...' : 'Unapprove'}
                            </Button>
                          )}
                        </div>
                        <p className="text-muted-foreground">Version {image.version}</p>

                        {/* Generation History Indicators */}
                        {image.sourceImage && (
                          <div className="mt-2 flex items-center gap-1 text-purple-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                            </svg>
                            <span className="text-[10px]">From {image.sourceImage.variant}</span>
                          </div>
                        )}
                        {image.parentImage && (
                          <div className="mt-1 flex items-center gap-1 text-orange-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                            </svg>
                            <span className="text-[10px]">Regenerated v{image.parentImage.version}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Table View */
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-card">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Image</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Filename</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Version</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {product.images.map((image) => (
                        <tr key={image.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3">
                            <div className="w-16 h-16 bg-accent rounded overflow-hidden">
                              <img
                                src={getImageUrl(image)}
                                alt={getImageDisplayName(image)}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground font-medium truncate max-w-[200px]" title={image.fileName}>
                              {image.fileName}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-muted-foreground">{getImageDisplayName(image)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={
                              image.status === 'APPROVED' ? 'success' :
                              image.status === 'REJECTED' ? 'destructive' :
                              image.status === 'COMPLETED' ? 'warning' :
                              'secondary'
                            }>
                              {image.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-muted-foreground">v{image.version}</p>
                          </td>
                          <td className="px-4 py-3">
                            {image.sourceImage ? (
                              <span className="text-xs text-purple-600">{image.sourceImage.variant}</span>
                            ) : image.parentImage ? (
                              <span className="text-xs text-orange-600">Regen v{image.parentImage.version}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {/* Approve/Reject buttons */}
                              {image.status !== 'APPROVED' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-success hover:bg-success/10"
                                  onClick={() => updateImageStatus(image.id, 'APPROVED')}
                                  disabled={updatingStatusId === image.id}
                                  title="Approve"
                                >
                                  {updatingStatusId === image.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-success"></div>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-success hover:text-warning hover:bg-warning/10"
                                  onClick={() => updateImageStatus(image.id, 'COMPLETED')}
                                  disabled={updatingStatusId === image.id}
                                  title="Unapprove"
                                >
                                  {updatingStatusId === image.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-warning"></div>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteImage(image.id)}
                                disabled={deletingImageId === image.id}
                                title="Delete"
                              >
                                {deletingImageId === image.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive"></div>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => downloadImage(getImageUrl(image), image.fileName)}
                                title="Download"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => openRegenerateModal(image.id, getImageDisplayName(image))}
                                title="Regenerate"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No generated images yet</p>
                <Button asChild className="bg-success hover:bg-success/90">
                  <Link href={`/products/${product.id}/generate`}>
                    Generate Images
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Amazon Push Section */}
        {product.asin && (
          <Card className="mt-6">
            <CardContent className="p-6">
              <AmazonImagePush
                productId={product.id}
                productAsin={product.asin || null}
                images={product.images || []}
                onPushComplete={loadProduct}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-secondary border border-border rounded-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">Regenerate Image</h2>

            <div className="mb-6">
              <p className="text-muted-foreground mb-4">
                This will create a new version using the current image as a source.
                Add instructions like "make the diamond smaller", "increase brightness", "change background color", etc.
              </p>

              <Label className="mb-2">
                Regeneration Prompt
              </Label>
              <Textarea
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="e.g., make the diamond smaller, increase product size, brighter lighting..."
                className="min-h-[120px] mt-2"
                disabled={regenerating}
              />
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-warning mb-2">How it works:</h3>
              <ul className="list-disc list-inside text-sm text-warning space-y-1">
                <li>The current image will be used as the source/base</li>
                <li>AI will apply your instructions to modify the image</li>
                <li>A new version will be created (version number will increment)</li>
                <li>The original image will remain unchanged</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRegenerateModal(false)
                  setRegeneratePrompt("")
                  setSelectedImageForRegeneration(null)
                }}
                disabled={regenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={regenerating || !regeneratePrompt.trim()}
              >
                {regenerating ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Regenerating...
                  </span>
                ) : (
                  'Regenerate Image'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
