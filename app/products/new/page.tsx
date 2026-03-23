"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function NewProductPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: "",
    category: "",
    description: ""
  })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Validate
      if (!formData.title.trim()) {
        throw new Error("Product title is required")
      }

      if (selectedFiles.length === 0) {
        throw new Error("Please upload at least one product image")
      }

      // Upload images first
      setUploadingImages(true)
      const uploadFormData = new FormData()
      selectedFiles.forEach(file => {
        uploadFormData.append("files", file)
      })

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadFormData
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload images')
      }

      const uploadData = await uploadResponse.json()
      setUploadingImages(false)

      // Create product
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          category: formData.category.trim() || undefined,
          metadata: {
            description: formData.description.trim(),
            uploadedImages: uploadData.files,
            inventory: { quantity: 1 }
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create product')
      }

      const product = await response.json()

      // Create source images from uploads
      let successCount = 0
      const errors: string[] = []

      for (let i = 0; i < uploadData.files.length; i++) {
        const file = uploadData.files[i]
        try {
          const sourceImageResponse = await fetch('/api/source-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.id,
              amazonImageUrl: file.filePath,
              localFilePath: file.filePath,
              variant: i === 0 ? 'MAIN' : `ALT${i}`,
              width: 1000,
              height: 1000,
              imageOrder: i
            })
          })

          if (!sourceImageResponse.ok) {
            const errorData = await sourceImageResponse.json()
            errors.push(`Image ${i + 1}: ${errorData.error || 'Unknown error'}`)
            console.error(`Failed to create source image ${i}:`, errorData)
          } else {
            successCount++
          }
        } catch (err) {
          errors.push(`Image ${i + 1}: ${err instanceof Error ? err.message : 'Failed to upload'}`)
          console.error(`Error creating source image ${i}:`, err)
        }
      }

      // Show warning if some images failed but continue
      if (errors.length > 0) {
        console.warn(`${successCount}/${uploadData.files.length} source images created successfully`)
        console.warn('Errors:', errors)
      }

      // Redirect to the product page
      router.push(`/products/${product.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setUploadingImages(false)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length === 0) return

    // Validate file types
    const validFiles = files.filter(file =>
      file.type.startsWith('image/')
    )

    if (validFiles.length !== files.length) {
      setError('Some files were skipped. Only image files are allowed.')
      setTimeout(() => setError(null), 3000)
    } else {
      setError(null)
    }

    setSelectedFiles(prev => [...prev, ...validFiles])

    // Create preview URLs
    const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file))
    setPreviewUrls(prev => [...prev, ...newPreviewUrls])
  }

  const removeImage = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))

    // Revoke the URL to free memory
    URL.revokeObjectURL(previewUrls[index])
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2"><h1 className="text-2xl font-bold text-foreground">Add New Product</h1></div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Create New Product</CardTitle>
            <CardDescription>
              Add a new product that hasn't been listed on Amazon yet. Upload product images and generate AI-enhanced visuals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-6 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="title">
                  Product Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="e.g., Premium Diamond Necklace"
                  className="mt-2"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <Label htmlFor="category">
                  Category
                </Label>
                <Input
                  type="text"
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Jewelry, Electronics, Fashion"
                  className="mt-2"
                  disabled={loading}
                />
              </div>

              <div>
                <Label htmlFor="description">
                  Description
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Brief description of your product..."
                  rows={3}
                  className="mt-2"
                  disabled={loading}
                />
              </div>

              <div>
                <Label>
                  Product Images <span className="text-destructive">*</span>
                </Label>
                <div className="mt-2 border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-primary transition">
                  <input
                    type="file"
                    id="images"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={loading}
                  />
                  <label htmlFor="images" className="cursor-pointer">
                    <svg
                      className="mx-auto h-12 w-12 text-muted-foreground"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-semibold text-primary hover:text-primary">
                        Click to upload
                      </span>{" "}
                      or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, GIF up to 10MB each
                    </p>
                  </label>
                </div>

                {previewUrls.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {previewUrls.map((url, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square bg-accent rounded-lg overflow-hidden">
                          <img
                            src={url}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                          disabled={loading}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <p className="text-xs text-muted-foreground mt-1 text-center">
                          {selectedFiles[index].name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                <h3 className="font-semibold text-primary mb-2">What happens next:</h3>
                <ul className="list-disc list-inside text-sm text-primary space-y-1">
                  <li>Your product will be created in the system</li>
                  <li>Uploaded images will be saved as source images</li>
                  <li>You can generate AI-enhanced product images</li>
                  <li>You can create product videos from the images</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" asChild>
                  <Link href="/dashboard">
                    Cancel
                  </Link>
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !formData.title.trim() || selectedFiles.length === 0}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {uploadingImages ? 'Uploading images...' : 'Creating product...'}
                    </span>
                  ) : (
                    'Create Product'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
