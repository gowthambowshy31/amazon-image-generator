'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ImageSelector from '@/app/components/ImageSelector'
import TemplateSelector, { TemplateSelection } from '@/app/components/TemplateSelector'

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Product not found</h2>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href={`/products/${product.id}`} className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Generate Video</h1>
            </div>
            <Link
              href={`/products/${product.id}/generate`}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg hover:from-green-600 hover:to-blue-700 font-semibold shadow-lg"
            >
              📸 Generate Images
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{product.title}</h2>
          <p className="text-sm text-gray-500">
            ASIN: {product.asin} | {product.sourceImages?.length || 0} source images | {product.images?.filter(i => i.status === 'COMPLETED').length || 0} generated images
          </p>
        </div>

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
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {templatePrompt ? "Additional Instructions (Optional)" : "Custom Instructions (Optional)"}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {templatePrompt
              ? "Add any additional instructions to combine with the template prompt above."
              : "Add specific instructions to customize the video (e.g., \"add slow motion\", \"bright lighting\", \"zoom in effect\"). This will be combined with the template's default prompt."
            }
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={templatePrompt ? "Additional instructions (optional)..." : "Enter custom instructions here..."}
            className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Video Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Video Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500"
              >
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (seconds)
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500"
              >
                <option value={4}>4 seconds</option>
                <option value={5}>5 seconds</option>
                <option value={6}>6 seconds</option>
                <option value={7}>7 seconds</option>
                <option value={8}>8 seconds</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={generateVideo}
            disabled={generating || !selectedTemplateId}
            className={`px-8 py-3 rounded-lg font-semibold text-white transition ${
              generating || !selectedTemplateId
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg'
            }`}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating Video...
              </span>
            ) : (
              '🎬 Generate Video'
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-2">How it works:</h3>
          <ul className="list-disc list-inside text-sm text-purple-800 space-y-1">
            <li>Select a video template that matches your needs</li>
            <li>Optionally choose a source image (Amazon or generated)</li>
            <li>Customize with additional instructions if needed</li>
            <li>AI will generate a professional product video (takes 1-2 minutes)</li>
            <li>Videos will appear below and can be downloaded</li>
          </ul>
        </div>

        {/* Generated Videos */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Generated Videos</h2>

          {videos.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No videos generated yet. Select a template and generate your first video!</p>
          ) : (
            <div className="space-y-4">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                        video.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-800'
                          : video.status === 'GENERATING'
                          ? 'bg-yellow-100 text-yellow-800'
                          : video.status === 'FAILED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {video.status}
                      </span>
                      {video.videoType && (
                        <span className="ml-2 text-sm font-medium text-purple-600">
                          {video.videoType.name}
                        </span>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        {video.aspectRatio} • {video.durationSeconds}s • {video.resolution}
                      </p>
                    </div>

                    {video.status === 'GENERATING' && video.operationName && (
                      <button
                        onClick={() => checkVideoStatus(video.operationName!, video.id)}
                        disabled={checkingStatus === video.id}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-sm"
                      >
                        {checkingStatus === video.id ? 'Checking...' : 'Check Status'}
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 mb-3 line-clamp-2">{video.promptUsed}</p>

                  {video.status === 'COMPLETED' && video.fileName && (
                    <div className="mt-4">
                      <video
                        controls
                        className="w-full rounded-lg max-h-96"
                        src={`/api/uploads/${video.fileName}`}
                      >
                        Your browser does not support the video tag.
                      </video>
                      <a
                        href={`/api/uploads/${video.fileName}`}
                        download
                        className="inline-block mt-3 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        📥 Download Video
                      </a>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-3">
                    Created: {new Date(video.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
