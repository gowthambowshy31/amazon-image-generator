# Bulk Generation by Variant - Implementation Plan

## Overview
Add a new `/bulk-generate` page where users can select multiple products, pick a variant (MAIN, PT01, etc.), choose a template/prompt, and generate images for all selected products at once.

## Phase 1: Backend API

### 1a. New API: `GET /api/products/variants-summary`
Returns the available variants across products with counts.

**Response:**
```json
{
  "variants": [
    { "variant": "MAIN", "count": 150 },
    { "variant": "PT01", "count": 130 },
    { "variant": "PT02", "count": 120 }
  ]
}
```

**File:** `app/api/products/variants-summary/route.ts`

### 1b. New API: `POST /api/images/bulk-generate-by-variant`
Accepts selected product IDs, variant, image type, and prompt. Creates a GenerationJob and processes images sequentially (calling the existing Gemini generation logic directly, reusing code from `/api/images/generate`).

**Request:**
```json
{
  "productIds": ["id1", "id2", "id3"],
  "variant": "MAIN",
  "imageTypeId": "type-id",
  "customPrompt": "optional prompt override",
  "templateId": "optional template id"
}
```

**Processing approach:**
- Creates a `GenerationJob` record with status `PROCESSING`
- For each product: finds the highest-res source image with the given variant, then calls the same generation logic used in `/api/images/generate` (generateImage from lib/gemini, upload to S3, create GeneratedImage record)
- Updates `completedImages` / `failedImages` counters on the job after each product
- Sets job to `COMPLETED` or `FAILED` when done

**File:** `app/api/images/bulk-generate-by-variant/route.ts`

### 1c. New API: `GET /api/jobs/[id]`
Returns status of a generation job for progress polling.

**File:** `app/api/jobs/[id]/route.ts`

## Phase 2: Frontend UI

### New page: `app/bulk-generate/page.tsx`

**Layout (top to bottom):**

1. **Header** - "Bulk Generate Images" title, back to dashboard link
2. **Step 1: Select Products** - Table with checkboxes (reuse dashboard product list pattern). Shows product title, ASIN, source image count. Has search/filter. "Select All" / "Deselect All" buttons.
3. **Step 2: Select Variant** - Dropdown showing variants with counts (e.g., "MAIN - 150 products"). Shows which selected products have the chosen variant, warns about products missing it. Preview thumbnails of the selected variant's images.
4. **Step 3: Configure Generation** - TemplateSelector component (reuse existing), custom prompt textarea, image type selector (single select).
5. **Step 4: Review & Generate** - Summary card showing "Generate X images using MAIN variant with template Y". Generate button.
6. **Progress Section** - Shows after generation starts. Progress bar, X/Y completed, error list. Uses polling to `GET /api/jobs/[id]` every 2 seconds.

### Dashboard link
Add a "Bulk Generate" button in the dashboard header next to existing navigation buttons.

## Phase 3: Job Processing & Monitoring

Built into Phase 1b and Phase 2 above:
- Job record tracks `totalImages`, `completedImages`, `failedImages`, `errorLog`
- Frontend polls `/api/jobs/[id]` every 2 seconds while job is `PROCESSING`
- Shows success/failure summary when job completes
- Link to view generated images on each product page

## Files to Create
1. `app/api/products/variants-summary/route.ts` - Variant counts API
2. `app/api/images/bulk-generate-by-variant/route.ts` - Bulk generation API
3. `app/api/jobs/[id]/route.ts` - Job status API
4. `app/bulk-generate/page.tsx` - Bulk generation UI page

## Files to Modify
1. `app/dashboard/page.tsx` - Add "Bulk Generate" nav button in header

## Existing Code to Reuse
- `generateImage()` from `lib/gemini.ts` - Core AI generation
- `uploadToS3()` from `lib/s3.ts` - S3 upload
- `TemplateSelector` component - Template/prompt selection
- `GenerationJob` model - Job tracking
- `GeneratedImage` model - Image records
- Dashboard patterns - Product list with checkboxes, filters, search
