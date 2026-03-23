# Amazon SP-API Integration Guide

## Overview

The platform now integrates with Amazon Selling Partner API (SP-API) to:
1. Fetch existing product details by ASIN
2. Download all product images from Amazon
3. Let users select which source image to use for each template type
4. Generate enhanced versions using Gemini AI

## Setup Instructions

### 1. Get Amazon SP-API Credentials

1. Go to [Amazon Seller Central Developer Console](https://sellercentral.amazon.com/apps/manage)
2. Register as a developer (if not already)
3. Create a new app:
   - App name: "Image Generator Platform"
   - OAuth Login URI: `http://localhost:3000/api/auth/amazon/callback`
   - OAuth Redirect URI: `http://localhost:3000/api/auth/amazon/callback`
4. Note down:
   - **LWA Client ID** (`AMAZON_CLIENT_ID`)
   - **LWA Client Secret** (`AMAZON_CLIENT_SECRET`)
5. Request access to Catalog Items API
6. Generate a **Refresh Token** using the SP-API authorization workflow

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Amazon SP-API (Selling Partner API)
AMAZON_REGION="na"                                    # North America
AMAZON_MARKETPLACE_ID="ATVPDKIKX0DER"                # US Marketplace
AMAZON_SELLER_ID="YOUR_SELLER_ID"                    # From Seller Central
AMAZON_CLIENT_ID="amzn1.application-oa2-client.xxx"  # LWA Client ID
AMAZON_CLIENT_SECRET="amzn1.oa2-cs.v1.xxx"           # LWA Client Secret
AMAZON_REFRESH_TOKEN="Atzr|xxx"                      # Generated refresh token
```

**Region Codes:**
- `na` - North America (US, CA, MX)
- `eu` - Europe (UK, DE, FR, IT, ES)
- `fe` - Far East (JP, AU, SG)

**Marketplace IDs:**
- US: `ATVPDKIKX0DER`
- CA: `A2EUQ1WTGCTBG2`
- UK: `A1F83G8C2ARO7P`
- DE: `A1PA6795UKMFR9`

### 3. Initialize Database

```bash
npm run db:push
npm run db:seed
```

## New Workflow

### Step 1: Fetch Product from Amazon

**API Endpoint:** `POST /api/amazon/fetch-product`

**Request:**
```json
{
  "asin": "B08N5WRWNW",
  "autoCreateProduct": true
}
```

**Response:**
```json
{
  "product": {
    "id": "clx123...",
    "asin": "B08N5WRWNW",
    "title": "Amazon Echo Dot (4th Gen)",
    "sourceImages": [
      {
        "id": "img1",
        "variant": "MAIN",
        "amazonImageUrl": "https://...",
        "localFilePath": "/uploads/source-images/clx123/MAIN_0_abc123.jpg",
        "imageOrder": 0
      },
      {
        "id": "img2",
        "variant": "PT01",
        "amazonImageUrl": "https://...",
        "localFilePath": "/uploads/source-images/clx123/PT01_1_def456.jpg",
        "imageOrder": 1
      }
    ]
  },
  "amazonData": {
    "asin": "B08N5WRWNW",
    "title": "Amazon Echo Dot (4th Gen)",
    "brand": "Amazon",
    "images": [...]
  }
}
```

**What happens:**
- Fetches product details from Amazon Catalog API
- Downloads all product images locally
- Creates/updates product record in database
- Stores source images with metadata

### Step 2: View Source Images

**API Endpoint:** `GET /api/products/{productId}/source-images`

**Response:**
```json
[
  {
    "id": "img1",
    "variant": "MAIN",
    "amazonImageUrl": "https://...",
    "localFilePath": "/uploads/source-images/clx123/MAIN_0_abc123.jpg",
    "imageOrder": 0,
    "width": 2000,
    "height": 2000
  },
  ...
]
```

### Step 3: Select Source Image for Each Template

**API Endpoint:** `POST /api/image-types/{imageTypeId}/source-image-mapping`

**Request:**
```json
{
  "productId": "clx123...",
  "sourceImageId": "img2"
}
```

**Example: Setting up templates**
```javascript
// For "Front View" template - use MAIN image
POST /api/image-types/front-view-id/source-image-mapping
{ "productId": "clx123", "sourceImageId": "img1" }

// For "Side View" template - use PT01 image
POST /api/image-types/side-view-id/source-image-mapping
{ "productId": "clx123", "sourceImageId": "img2" }

// For "Lifestyle" template - use PT02 image
POST /api/image-types/lifestyle-id/source-image-mapping
{ "productId": "clx123", "sourceImageId": "img3" }
```

This saves the mapping in the product's metadata, so the platform knows which source image to use for each template type.

### Step 4: Generate Enhanced Image

**API Endpoint:** `POST /api/images/generate`

**Request:**
```json
{
  "productId": "clx123...",
  "imageTypeId": "front-view-id",
  "sourceImageId": "img1"
}
```

**What happens:**
1. Loads the selected source image (or uses mapping from Step 3)
2. Applies the template prompt (e.g., "Create a professional front view...")
3. Uses Gemini AI to enhance/transform the image
4. Saves the generated image with version tracking

**Note:** If you don't provide `sourceImageId`, the system will:
1. Check if there's a saved mapping for this template
2. Fall back to the first source image
3. Or use a parent image if regenerating

## Database Schema Changes

### New Model: `SourceImage`

Stores images downloaded from Amazon:

```prisma
model SourceImage {
  id              String    @id @default(cuid())
  productId       String
  product         Product   @relation(...)
  amazonImageUrl  String               // Original Amazon URL
  localFilePath   String?              // Local copy
  imageOrder      Int       @default(0) // Order in listing
  width           Int?
  height          Int?
  fileSize        Int?
  variant         String?              // MAIN, PT01, PT02, etc.

  generatedImages GeneratedImage[]    // Track which images used this source
}
```

### Updated Model: `GeneratedImage`

Now tracks which source image was used:

```prisma
model GeneratedImage {
  // ... existing fields
  sourceImageId   String?
  sourceImage     SourceImage? @relation(...)
}
```

### Updated Model: `Product`

Metadata now stores source image mappings per template:

```json
{
  "brand": "Amazon",
  "sourceImageMappings": {
    "front-view-template-id": "source-img-1-id",
    "side-view-template-id": "source-img-2-id",
    "lifestyle-template-id": "source-img-3-id"
  }
}
```

## API Reference

### Fetch Product from Amazon
```
POST /api/amazon/fetch-product
Body: { asin, autoCreateProduct }
```

### Get Product Source Images
```
GET /api/products/{id}/source-images
```

### Set Source Image for Template
```
POST /api/image-types/{imageTypeId}/source-image-mapping
Body: { productId, sourceImageId }
```

### Get Source Image Mapping
```
GET /api/image-types/{imageTypeId}/source-image-mapping?productId={id}
```

### Generate Image (Updated)
```
POST /api/images/generate
Body: { productId, imageTypeId, sourceImageId?, customPrompt? }
```

## File Structure

```
lib/
├── amazon-sp.ts          # Amazon SP-API client
├── image-storage.ts      # Image download/storage utilities
├── gemini.ts             # AI image generation
└── prisma.ts             # Database client

app/api/
├── amazon/
│   └── fetch-product/    # Fetch from Amazon
├── products/
│   └── [id]/
│       └── source-images/ # List source images
├── image-types/
│   └── [id]/
│       └── source-image-mapping/ # Template mappings
└── images/
    └── generate/         # Generate enhanced images

public/uploads/
└── source-images/        # Downloaded Amazon images
    └── {productId}/
        ├── MAIN_0_abc.jpg
        ├── PT01_1_def.jpg
        └── PT02_2_ghi.jpg
```

## Common Issues

### Authentication Failed
- Verify your `AMAZON_REFRESH_TOKEN` is valid
- Tokens expire - regenerate if needed
- Check your app has access to Catalog Items API

### Product Not Found
- Ensure the ASIN exists in your seller catalog
- SP-API only returns products you have access to
- Use the correct marketplace ID for your region

### Image Download Fails
- Check network connectivity
- Verify upload directory has write permissions
- Amazon image URLs may be temporary - retry if needed

## Next Steps

1. **Build UI Components:**
   - Product ASIN input form
   - Source image gallery viewer
   - Source image selector per template
   - Template configuration page

2. **Enhance AI Generation:**
   - Implement actual Gemini image editing API
   - Add style transfer options
   - Background removal/replacement
   - Product positioning controls

3. **Add Batch Processing:**
   - Bulk fetch multiple ASINs
   - Auto-map source images to templates
   - Queue generation for all templates

## Testing

```javascript
// 1. Fetch a product
fetch('/api/amazon/fetch-product', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    asin: 'B08N5WRWNW',
    autoCreateProduct: true
  })
})

// 2. View source images
fetch('/api/products/{productId}/source-images')

// 3. Map source image to template
fetch('/api/image-types/{imageTypeId}/source-image-mapping', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 'xxx',
    sourceImageId: 'yyy'
  })
})

// 4. Generate enhanced image
fetch('/api/images/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 'xxx',
    imageTypeId: 'yyy',
    sourceImageId: 'zzz'
  })
})
```
