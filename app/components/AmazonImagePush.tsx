"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

interface PushHistoryRecord {
  id: string
  amazonSlot: string
  status: string
  createdAt: string
  completedAt: string | null
  generatedImage: {
    id: string
    fileName: string
    name: string
  } | null
}

interface AmazonImagePushProps {
  productId: string
  productAsin: string | null
  images: GeneratedImage[]
  onPushComplete: () => void
  onUnapprove?: (imageId: string) => void
}

const AMAZON_SLOTS = [
  { value: 'MAIN', label: 'Main Image', description: 'Primary product image' },
  { value: 'PT01', label: 'PT01', description: 'Additional image 1' },
  { value: 'PT02', label: 'PT02', description: 'Additional image 2' },
  { value: 'PT03', label: 'PT03', description: 'Additional image 3' },
  { value: 'PT04', label: 'PT04', description: 'Additional image 4' },
  { value: 'PT05', label: 'PT05', description: 'Additional image 5' },
  { value: 'PT06', label: 'PT06', description: 'Additional image 6' },
  { value: 'PT07', label: 'PT07', description: 'Additional image 7' },
  { value: 'PT08', label: 'PT08', description: 'Additional image 8' },
]

export default function AmazonImagePush({
  productId,
  productAsin,
  images,
  onPushComplete,
  onUnapprove
}: AmazonImagePushProps) {
  const [selectedImages, setSelectedImages] = useState<Map<string, string>>(new Map())
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pushHistory, setPushHistory] = useState<PushHistoryRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [unapprovingId, setUnapprovingId] = useState<string | null>(null)

  // Filter to only approved images
  const approvedImages = images.filter(img => img.status === 'APPROVED')

  // Load push history on mount
  useEffect(() => {
    if (productId) {
      loadPushHistory()
    }
  }, [productId])

  const loadPushHistory = async () => {
    try {
      const response = await fetch(`/api/amazon/push-history?productId=${productId}`)
      if (response.ok) {
        const data = await response.json()
        setPushHistory(data.history || [])
      }
    } catch (err) {
      console.error('Failed to load push history:', err)
    }
  }

  // Get image display URL for preview
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

  // Get image display name
  const getImageName = (image: GeneratedImage) => {
    return image.templateName || image.template?.name || image.imageType?.name || image.fileName
  }

  const handleUnapprove = async (imageId: string) => {
    if (onUnapprove) {
      onUnapprove(imageId)
      return
    }

    // If no callback provided, handle it internally
    setUnapprovingId(imageId)
    try {
      const response = await fetch(`/api/images/${imageId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      })
      if (response.ok) {
        // Remove from selected images if it was selected
        const newSelected = new Map(selectedImages)
        newSelected.delete(imageId)
        setSelectedImages(newSelected)
        onPushComplete() // Refresh the parent
      } else {
        const errorData = await response.json()
        setError(`Failed to unapprove: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUnapprovingId(null)
    }
  }

  const handleSlotChange = (imageId: string, slot: string) => {
    const newSelected = new Map(selectedImages)
    if (slot === '') {
      newSelected.delete(imageId)
    } else {
      // Remove slot from any other image that has it
      for (const [id, s] of newSelected.entries()) {
        if (s === slot && id !== imageId) {
          newSelected.delete(id)
        }
      }
      newSelected.set(imageId, slot)
    }
    setSelectedImages(newSelected)
    setError(null)
    setSuccess(null)
  }

  const handlePush = async () => {
    if (selectedImages.size === 0) {
      setError("Please select at least one image and assign an Amazon slot")
      return
    }

    setPushing(true)
    setError(null)
    setSuccess(null)

    try {
      const imagesToPush = Array.from(selectedImages.entries()).map(([imageId, slot]) => ({
        generatedImageId: imageId,
        amazonSlot: slot
      }))

      const response = await fetch('/api/amazon/push-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          images: imagesToPush
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSuccess(result.message)
        setSelectedImages(new Map())
        loadPushHistory()
        onPushComplete()
      } else {
        setError(result.error || result.details || 'Failed to push images to Amazon')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setPushing(false)
    }
  }

  // If no ASIN, show warning
  if (!productAsin) {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-warning mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-semibold text-warning">No ASIN Found</h3>
            <p className="text-warning text-sm mt-1">
              This product doesn't have an ASIN. Images cannot be pushed to Amazon without an ASIN.
              Import this product from Amazon or add the ASIN manually.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // If no approved images, show message
  if (approvedImages.length === 0) {
    return (
      <div className="bg-background border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-muted-foreground mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div>
            <h3 className="font-semibold text-muted-foreground">No Approved Images</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Approve generated images before pushing them to Amazon.
              Only images with "APPROVED" status can be pushed.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <svg className="w-5 h-5 text-warning" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 2C6.81 2 2 6.81 2 12.5c0 4.73 3.21 8.71 7.56 9.89.07.01.13.01.19.01.41 0 .56-.31.56-.57v-2.04c-.83.18-1.21-.39-1.29-.39-.15-.37-.36-.65-.62-.84-.26-.19-.39-.31-.39-.31-.31-.22.02-.22.07-.22.35.03.64.18.87.4.24.22.4.5.47.81.12.56.42 1.02.87 1.29.45.27.97.33 1.46.17.04-.35.18-.67.41-.92-.19-.04-.37-.1-.54-.16-2.29-.69-3.36-2.41-3.36-4.33 0-.81.26-1.57.74-2.22-.07-.23-.31-1.01.07-2.11 0 0 .02 0 .05-.01.03-.01.11-.01.23-.01.31 0 .89.11 1.77.73.5-.14 1.04-.21 1.58-.21s1.08.07 1.58.21c.88-.62 1.46-.73 1.77-.73.12 0 .2 0 .23.01.03.01.05.01.05.01.38 1.1.14 1.88.07 2.11.48.65.74 1.41.74 2.22 0 1.92-1.07 3.64-3.36 4.33-.17.06-.35.12-.54.16.28.31.42.71.42 1.14v2.26c0 .26.15.57.56.57.06 0 .12 0 .19-.01C18.79 21.21 22 17.23 22 12.5 22 6.81 17.19 2 12.5 2z"/>
            </svg>
            Push to Amazon
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            ASIN: <span className="font-mono font-medium">{productAsin}</span>
          </p>
        </div>

        {pushHistory.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="text-primary hover:text-primary flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showHistory ? 'Hide' : 'Show'} History ({pushHistory.length})
          </Button>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
          <svg className="w-5 h-5 text-destructive shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-start gap-2">
          <svg className="w-5 h-5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-success text-sm">{success}</p>
        </div>
      )}

      {/* Push History (collapsible) */}
      {showHistory && pushHistory.length > 0 && (
        <div className="bg-background rounded-lg p-3">
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Recent Push History</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {pushHistory.slice(0, 10).map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between text-xs bg-secondary/30 p-2 rounded border border-border"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={
                    record.amazonSlot === 'MAIN' ? 'bg-violet-500/20 text-violet-400' : 'bg-muted text-muted-foreground'
                  }>
                    {record.amazonSlot}
                  </Badge>
                  <span className="text-muted-foreground truncate max-w-[150px]">
                    {record.generatedImage?.name || 'Unknown Image'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </span>
                  <Badge variant="secondary" className={`text-[10px] font-semibold ${
                    record.status === 'SUCCESS' ? 'bg-success/20 text-success' :
                    record.status === 'FAILED' ? 'bg-destructive/20 text-destructive' :
                    'bg-warning/20 text-warning'
                  }`}>
                    {record.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Selection Grid */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Select approved images and assign them to Amazon image slots:
        </p>

        {approvedImages.map((image) => {
          const selectedSlot = selectedImages.get(image.id) || ''
          const isSelected = selectedSlot !== ''

          return (
            <div
              key={image.id}
              className={`flex items-center gap-4 p-3 border rounded-lg transition ${
                isSelected
                  ? 'border-warning bg-warning/10'
                  : 'border-border hover:border-input'
              }`}
            >
              {/* Image Preview */}
              <div className="w-16 h-16 bg-accent rounded overflow-hidden shrink-0">
                <img
                  src={getImageUrl(image)}
                  alt={getImageName(image)}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Image Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">
                  {getImageName(image)}
                </p>
                {image.amazonPushedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last pushed: {new Date(image.amazonPushedAt).toLocaleString()}
                    {image.amazonSlot && (
                      <span className="ml-1 text-violet-400">({image.amazonSlot})</span>
                    )}
                  </p>
                )}
                {image.amazonPushStatus === 'SUCCESS' && (
                  <span className="inline-flex items-center text-xs text-success mt-1">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    On Amazon
                  </span>
                )}
              </div>

              {/* Slot Selector */}
              <select
                value={selectedSlot}
                onChange={(e) => handleSlotChange(image.id, e.target.value)}
                disabled={pushing || unapprovingId === image.id}
                className={`border rounded-lg px-3 py-2 text-sm min-w-[140px] ${
                  isSelected
                    ? 'border-warning bg-secondary/30'
                    : 'border-input'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select slot...</option>
                {AMAZON_SLOTS.map((slot) => {
                  const isUsedByOther = Array.from(selectedImages.entries())
                    .some(([id, s]) => s === slot.value && id !== image.id)

                  return (
                    <option
                      key={slot.value}
                      value={slot.value}
                      disabled={isUsedByOther}
                    >
                      {slot.label} {isUsedByOther ? '(selected)' : ''}
                    </option>
                  )
                })}
              </select>

              {/* Unapprove Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleUnapprove(image.id)}
                disabled={pushing || unapprovingId === image.id}
                className="text-muted-foreground hover:text-warning hover:bg-warning/10"
                title="Unapprove image"
              >
                {unapprovingId === image.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-warning border-t-transparent"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Footer with Push Button */}
      <div className="flex justify-between items-center pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {selectedImages.size === 0 ? (
            'No images selected'
          ) : (
            <span className="text-warning font-medium">
              {selectedImages.size} image{selectedImages.size > 1 ? 's' : ''} selected
            </span>
          )}
        </p>

        <Button
          onClick={handlePush}
          disabled={pushing || selectedImages.size === 0}
          className="bg-orange-600 text-white hover:bg-orange-500 flex items-center gap-2 font-medium px-6"
        >
          {pushing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Pushing to Amazon...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Push to Amazon
            </>
          )}
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-xs text-primary">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5 text-primary">
          <li>Select images and assign them to Amazon image slots (MAIN = primary image)</li>
          <li>Click "Push to Amazon" to update your listing images</li>
          <li>Amazon may take a few minutes to process and display the new images</li>
          <li>Ensure your S3 bucket allows Amazon to read the images</li>
        </ul>
      </div>
    </div>
  )
}
