"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import ImageSelector from "@/app/components/ImageSelector"
import TemplateSelector, { TemplateSelection } from "@/app/components/TemplateSelector"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
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

  const getImageLabel = (img: GeneratedImage) => {
    return img.templateName || img.template?.name || img.imageType?.name || 'Generated'
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">Generate Image</h1>
          <Button asChild className="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 font-semibold">
            <Link href={`/products/${product.id}/generate-video`}>
              Generate Video
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
              ASIN: {product.asin} | {product.sourceImages?.length || 0} source images available
            </p>
          </CardContent>
        </Card>

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
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {templateSelections.length > 0 ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {templateSelections.length > 0
                ? "Add any additional instructions to combine with the template prompts above."
                : "Add specific instructions for the AI (e.g., \"make the diamond smaller\", \"increase product size\", \"brighter lighting\")."
              }
            </p>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={templateSelections.length > 0 ? "Additional instructions (optional)..." : "Enter custom instructions here..."}
              className="min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Generation Progress */}
        {progress && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">{progress}</p>
            </CardContent>
          </Card>
        )}

        {/* Generate Button */}
        <div className="flex justify-center">
          <Button
            onClick={generateImages}
            disabled={generating || templateSelections.length === 0}
            size="lg"
            className={`px-8 font-semibold ${
              generating || templateSelections.length === 0
                ? ''
                : 'bg-success hover:bg-success/90'
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
          </Button>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-primary/10 border border-primary/30 rounded-lg p-4">
          <h3 className="font-semibold text-primary mb-2">How it works:</h3>
          <ul className="list-disc list-inside text-sm text-primary space-y-1">
            <li>Select the templates for the types of images you want to generate</li>
            <li>AI will analyze your product&apos;s source images from Amazon</li>
            <li>New marketing images will be created based on the selected templates</li>
            <li>Generated images will appear on the product detail page for review</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  )
}
