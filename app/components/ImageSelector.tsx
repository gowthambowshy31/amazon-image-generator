"use client"

import { Card, CardContent } from "@/components/ui/card"

interface Image {
  id: string
  url: string
  label: string
  sublabel?: string
  width?: number
  height?: number
}

interface ImageSelectorProps {
  images: Image[]
  selectedImageId: string
  onSelect: (imageId: string) => void
  title: string
  description?: string
  emptyMessage?: string
}

export default function ImageSelector({
  images,
  selectedImageId,
  onSelect,
  title,
  description,
  emptyMessage = "No images available"
}: ImageSelectorProps) {
  if (images.length === 0) {
    return (
      <Card className="shadow-sm mb-6">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
          <p className="text-sm text-muted-foreground italic text-center py-8">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm mb-6">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              onClick={() => onSelect(selectedImageId === img.id ? "" : img.id)}
              className={`relative border-2 rounded-lg p-2 cursor-pointer transition ${
                selectedImageId === img.id
                  ? 'border-success bg-success/10'
                  : 'border-border hover:border-input'
              }`}
            >
              <img
                src={img.url}
                alt={img.label}
                className="w-full h-32 object-contain mb-2"
              />
              <div className="text-xs text-center">
                <p className="font-semibold text-muted-foreground">{img.label}</p>
                {img.sublabel && <p className="text-muted-foreground">{img.sublabel}</p>}
                {img.width && img.height && (
                  <p className="text-muted-foreground">{img.width}x{img.height}</p>
                )}
              </div>
              {selectedImageId === img.id && (
                <div className="absolute top-2 right-2 bg-success text-white rounded-full w-6 h-6 flex items-center justify-center">
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
