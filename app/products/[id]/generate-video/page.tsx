'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ImageSelector from '@/app/components/ImageSelector'
import TemplateSelector, { TemplateSelection } from '@/app/components/TemplateSelector'
import DashboardLayout from '@/app/components/DashboardLayout'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  metadata?: any
  sourceImages: SourceImage[]
  images?: GeneratedImage[]
}

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
  fileName: string
  filePath: string
  width: number
  height: number
  templateName?: string | null
  imageType?: {
    id: string
    name: string
  } | null
  template?: {
    id: string
    name: string
  } | null
  status: string
}

interface Video {
  id: string
  status: string
  fileName?: string
  operationName?: string
  promptUsed: string
  aspectRatio: string
  durationSeconds: number
  resolution: string
  createdAt: string
  videoType?: {
    id: string
    name: string
  }
}

export default function GenerateVideoPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedSourceImage, setSelectedSourceImage] = useState<string>('')
  const [selectedGeneratedImage, setSelectedGeneratedImage] = useState<string>('')
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null)
  const [provider, setProvider] = useState<'veo' | 'seedance'>('veo')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [duration, setDuration] = useState(4)
  const [resolution, setResolution] = useState('720p')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    // Get template ID from URL query params
    const templateId = searchParams.get("templateId")
    if (templateId) {
      setInitialTemplateId(templateId)
    }
  }, [searchParams])

  const loadData = async () => {
    try {
      const [productRes, videosRes] = await Promise.all([
        fetch(`/api/products/${params.id}`),
        fetch(`/api/videos?productId=${params.id}`)
      ])

      if (productRes.ok) {
        const productData = await productRes.json()
        setProduct(productData)
      }

      if (videosRes.ok) {
        const videosData = await videosRes.json()
        setVideos(videosData)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateVideo = async () => {
    if (!product || !selectedTemplateId) {
      alert('Please select a video template')
      return
    }

    setGenerating(true)
    try {
      const requestBody: any = {
        productId: product.id,
        templateId: selectedTemplateId,
        provider,
        aspectRatio,
        durationSeconds: duration,
        resolution
      }

      // Add source image if selected (Amazon images take priority)
      if (selectedSourceImage) {
        requestBody.sourceImageId = selectedSourceImage
      } else if (selectedGeneratedImage) {
        requestBody.generatedImageId = selectedGeneratedImage
      }

      // Build the final prompt: template + custom additions
      const finalPrompt = [templatePrompt, customPrompt.trim()].filter(Boolean).join("\n\n")
      if (finalPrompt) {
        requestBody.customPrompt = finalPrompt
      }

      const response = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const error = await response.json()
        alert(`Failed to generate video: ${error.error}`)
        return
      }

      const result = await response.json()
      alert('Video generation started! It will appear below when ready.')

      // Add to videos list
      setVideos([result.video, ...videos])

      // Automatically start checking status
      if (result.operationName) {
        setTimeout(() => checkVideoStatus(result.operationName, result.video.id), 5000)
      }

      // Reset form
      setCustomPrompt('')
    } catch (error) {
      console.error('Error generating video:', error)
      alert('Failed to generate video')
    } finally {
      setGenerating(false)
    }
  }

  const checkVideoStatus = async (operationName: string, videoId: string) => {
    setCheckingStatus(videoId)
    try {
      const response = await fetch('/api/videos/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName, videoId })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to parse error response' }))
        console.error('Failed to check status:', error)
        // Don't alert user, just log the error and stop checking
        return
      }

      const result = await response.json()

      if (result.done) {
        alert('Video generation complete!')
        loadData() // Reload to get updated status
      } else {
        // Keep checking
        setTimeout(() => checkVideoStatus(operationName, videoId), 10000)
      }
    } catch (error) {
      console.error('Error checking status:', error)
    } finally {
      setCheckingStatus(null)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!product) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive mb-4">Product not found</h2>
            <Link href="/dashboard" className="text-primary hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">Generate Video</h1>
          <Button asChild className="bg-gradient-to-r from-emerald-600 to-primary hover:from-emerald-500 hover:to-primary/90 font-semibold">
            <Link href={`/products/${product.id}/generate`}>
              Generate Images
            </Link>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-2">{product.title}</h2>
            <p className="text-sm text-muted-foreground">
              ASIN: {product.asin} | {product.sourceImages?.length || 0} source images | {product.images?.filter(i => i.status === 'COMPLETED').length || 0} generated images
            </p>
          </CardContent>
        </Card>

        {/* Amazon Source Image Selection */}
        {product.sourceImages && product.sourceImages.length > 0 && (
          <ImageSelector
            title="Amazon Source Images"
            description="Select a product image to use as reference for the video (optional). The AI will use this to generate a video based on the product."
            images={product.sourceImages.map(img => ({
              id: img.id,
              url: img.localFilePath?.startsWith('http') ? img.localFilePath : img.localFilePath ? `/api${img.localFilePath}` : img.amazonImageUrl,
              label: img.variant,
              width: img.width,
              height: img.height
            }))}
            selectedImageId={selectedSourceImage}
            onSelect={(id) => {
              setSelectedSourceImage(id)
              if (id) setSelectedGeneratedImage("")
            }}
          />
        )}

        {/* Generated Images Selection */}
        {product.images && product.images.length > 0 && (
          <ImageSelector
            title="AI Generated Images"
            description="Or select a previously generated image to create a video from it."
            images={product.images
              .filter(img => img.status === 'COMPLETED')
              .map(img => ({
                id: img.id,
                url: img.filePath?.startsWith('http') ? img.filePath : `/api/uploads/${img.fileName}`,
                label: img.templateName || img.template?.name || img.imageType?.name || 'Generated',
                width: img.width,
                height: img.height
              }))}
            selectedImageId={selectedGeneratedImage}
            onSelect={(id) => {
              setSelectedGeneratedImage(id)
              if (id) setSelectedSourceImage("")
            }}
            emptyMessage="No generated images available. Generate images first to use them as video source!"
          />
        )}

        {/* Template Selector */}
        {product && (
          <TemplateSelector
            category="video"
            mode="single"
            product={{
              id: product.id,
              title: product.title,
              category: product.category,
              asin: product.asin,
              metadata: product.metadata
            }}
            initialTemplateId={initialTemplateId}
            onSelectionChange={(selections) => {
              if (selections.length > 0) {
                setTemplatePrompt(selections[0].renderedPrompt)
                setSelectedTemplateId(selections[0].templateId)
              } else {
                setTemplatePrompt(null)
                setSelectedTemplateId(null)
              }
            }}
          />
        )}

        {/* Custom Prompt */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {templatePrompt ? "Additional Instructions (Optional)" : "Custom Instructions (Optional)"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {templatePrompt
                ? "Add any additional instructions to combine with the template prompt above."
                : "Add specific instructions to customize the video (e.g., \"add slow motion\", \"bright lighting\", \"zoom in effect\"). This will be combined with the template's default prompt."
              }
            </p>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={templatePrompt ? "Additional instructions (optional)..." : "Enter custom instructions here..."}
              className="min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Video Settings */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Video Settings</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="mb-2">
                  Model
                </Label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const v = e.target.value as 'veo' | 'seedance'
                    setProvider(v)
                    // Seedance supports 5–10s sweet spot; Veo supports 4–8s
                    if (v === 'seedance' && duration < 5) setDuration(5)
                    if (v === 'veo' && duration > 8) setDuration(8)
                  }}
                  className="mt-2 w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="veo">Google Veo 3.1</option>
                  <option value="seedance">Seedance 1.0 Pro</option>
                </select>
              </div>

              <div>
                <Label className="mb-2">
                  Aspect Ratio
                </Label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="mt-2 w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div>
                <Label className="mb-2">
                  Duration (seconds)
                </Label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="mt-2 w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {(provider === 'seedance'
                    ? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                    : [4, 5, 6, 7, 8]
                  ).map((s) => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="mb-2">
                  Resolution
                </Label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="mt-2 w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {provider === 'seedance' && <option value="480p">480p</option>}
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
        <div className="flex justify-center mb-6">
          <Button
            onClick={generateVideo}
            disabled={generating || !selectedTemplateId}
            size="lg"
            className={`px-8 font-semibold ${
              generating || !selectedTemplateId
                ? ''
                : 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500'
            }`}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating Video...
              </span>
            ) : (
              'Generate Video'
            )}
          </Button>
        </div>

        {/* Info Box */}
        <div className="mb-6 bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
          <h3 className="font-semibold text-violet-300 mb-2">How it works:</h3>
          <ul className="list-disc list-inside text-sm text-violet-400 space-y-1">
            <li>Select a video template that matches your needs</li>
            <li>Optionally choose a source image (Amazon or generated)</li>
            <li>Customize with additional instructions if needed</li>
            <li>AI will generate a professional product video (takes 1-2 minutes)</li>
            <li>Videos will appear below and can be downloaded</li>
          </ul>
        </div>

        {/* Generated Videos */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Videos</CardTitle>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No videos generated yet. Select a template and generate your first video!</p>
            ) : (
              <div className="space-y-4">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="border border-border rounded-lg p-4 hover:border-input transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge variant={
                          video.status === 'COMPLETED'
                            ? 'success'
                            : video.status === 'GENERATING'
                            ? 'warning'
                            : video.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                        }>
                          {video.status}
                        </Badge>
                        {video.videoType && (
                          <span className="ml-2 text-sm font-medium text-violet-400">
                            {video.videoType.name}
                          </span>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">
                          {video.aspectRatio} * {video.durationSeconds}s * {video.resolution}
                        </p>
                      </div>

                      {video.status === 'GENERATING' && video.operationName && (
                        <Button
                          size="sm"
                          onClick={() => checkVideoStatus(video.operationName!, video.id)}
                          disabled={checkingStatus === video.id}
                        >
                          {checkingStatus === video.id ? 'Checking...' : 'Check Status'}
                        </Button>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{video.promptUsed}</p>

                    {video.status === 'COMPLETED' && video.fileName && (
                      <div className="mt-4">
                        <video
                          controls
                          className="w-full rounded-lg max-h-96"
                          src={`/api/uploads/${video.fileName}`}
                        >
                          Your browser does not support the video tag.
                        </video>
                        <Button
                          asChild
                          size="sm"
                          className="mt-3 bg-success hover:bg-success/90"
                        >
                          <a
                            href={`/api/uploads/${video.fileName}`}
                            download
                          >
                            Download Video
                          </a>
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-3">
                      Created: {new Date(video.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
