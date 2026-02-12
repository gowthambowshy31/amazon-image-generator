"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import ImageSelector from "@/app/components/ImageSelector"
import TemplateSelector, { TemplateSelection } from "@/app/components/TemplateSelector"

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

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  metadata?: any
  sourceImages: SourceImage[]
  images?: GeneratedImage[]
}

export default function GenerateImagesPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [selectedSourceImage, setSelectedSourceImage] = useState<string>("")
  const [selectedGeneratedImage, setSelectedGeneratedImage] = useState<string>("")
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [templateSelections, setTemplateSelections] = useState<TemplateSelection[]>([])
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<string>("")

  useEffect(() => {
    loadData()
    const templateId = searchParams.get("templateId")
    if (templateId) {
      setInitialTemplateId(templateId)
    }
  }, [params.id, searchParams])

  const loadData = async () => {
    try {
      const productRes = await fetch(`/api/products/${params.id}`)
      if (productRes.ok) {
        const productData = await productRes.json()
        setProduct(productData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateImages = async () => {
    if (!product || templateSelections.length === 0) return

    setGenerating(true)
    let successCount = 0
    let failCount = 0

    try {
      for (let i = 0; i < templateSelections.length; i++) {
        const selection = templateSelections[i]

        setProgress(`Generating ${i + 1}/${templateSelections.length}: ${selection.templateName}...`)

        try {
          const requestBody: any = {
            productId: product.id,
            templateId: selection.templateId,
            renderedPrompt: selection.renderedPrompt
          }

          // Add optional source image
          if (selectedSourceImage) {
            requestBody.sourceImageId = selectedSourceImage
          } else if (selectedGeneratedImage) {
            requestBody.generatedImageId = selectedGeneratedImage
          }

          // Append custom prompt if any
          if (customPrompt.trim()) {
            requestBody.renderedPrompt = selection.renderedPrompt + "\n\n" + customPrompt.trim()
          }

          const response = await fetch('/api/images/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          })

          if (response.ok) {
            successCount++
          } else {
            failCount++
            console.error(`Failed to generate ${selection.templateName}`)
          }
        } catch (err) {
          failCount++
          console.error(`Error generating ${selection.templateName}:`, err)
        }
      }

      if (successCount > 0) {
        setProgress(`Successfully generated ${successCount} image${successCount !== 1 ? 's' : ''}! Redirecting...${failCount > 0 ? ` (${failCount} failed)` : ''}`)

        setTimeout(() => {
          window.location.href = `/products/${product.id}`
        }, 2000)
      } else {
        setProgress(`Failed to generate images. Please try again.`)
      }
    } catch (error) {
      setProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
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

  const getImageLabel = (img: GeneratedImage) => {
    return img.templateName || img.template?.name || img.imageType?.name || 'Generated'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href={`/products/${product.id}`} className="text-gray-600 hover:text-gray-900">
                &larr; Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Generate Images</h1>
            </div>
            <Link
              href={`/products/${product.id}/generate-video`}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 font-semibold shadow-lg"
            >
              Generate Video
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{product.title}</h2>
          <p className="text-sm text-gray-500">
            ASIN: {product.asin} | {product.sourceImages?.length || 0} source images available
          </p>
        </div>

        {/* Amazon Source Image Selection */}
        {product.sourceImages && product.sourceImages.length > 0 && (
          <ImageSelector
            title="Amazon Source Images"
            description="Choose a specific Amazon product image to use as the base for generation, or leave unselected to use the default."
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
            description="Select a previously generated image to use as the base for creating new images with different templates."
            images={product.images
              .filter(img => img.status === 'COMPLETED')
              .map(img => ({
                id: img.id,
                url: img.filePath?.startsWith('http') ? img.filePath : `/api/uploads/${img.fileName}`,
                label: getImageLabel(img),
                sublabel: `v${getImageLabel(img)}`,
                width: img.width,
                height: img.height
              }))}
            selectedImageId={selectedGeneratedImage}
            onSelect={(id) => {
              setSelectedGeneratedImage(id)
              if (id) setSelectedSourceImage("")
            }}
            emptyMessage="No completed generated images available yet. Generate some images first!"
          />
        )}

        {/* Template Selector (replaces old Image Type checkboxes) */}
        {product && (
          <TemplateSelector
            category="image"
            mode="multi"
            product={{
              id: product.id,
              title: product.title,
              category: product.category,
              asin: product.asin,
              metadata: product.metadata
            }}
            initialTemplateId={initialTemplateId}
            onSelectionChange={(selections) => {
              setTemplateSelections(selections)
            }}
          />
        )}

        {/* Custom Prompt */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {templateSelections.length > 0 ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {templateSelections.length > 0
              ? "Add any additional instructions to combine with the template prompts above."
              : "Add specific instructions for the AI (e.g., \"make the diamond smaller\", \"increase product size\", \"brighter lighting\")."
            }
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={templateSelections.length > 0 ? "Additional instructions (optional)..." : "Enter custom instructions here..."}
            className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Generation Progress */}
        {progress && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <p className="text-center text-gray-700">{progress}</p>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex justify-center">
          <button
            onClick={generateImages}
            disabled={generating || templateSelections.length === 0}
            className={`px-8 py-3 rounded-lg font-semibold text-white transition ${
              generating || templateSelections.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating...
              </span>
            ) : (
              `Generate ${templateSelections.length} Image${templateSelections.length !== 1 ? 's' : ''}`
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            <li>Select the templates for the types of images you want to generate</li>
            <li>AI will analyze your product&apos;s source images from Amazon</li>
            <li>New marketing images will be created based on the selected templates</li>
            <li>Generated images will appear on the product detail page for review</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
