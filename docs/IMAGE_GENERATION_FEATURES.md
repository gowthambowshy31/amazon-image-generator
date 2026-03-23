# Image Generation Features

## Overview
This platform now supports advanced image generation with source selection, custom prompts, and iterative regeneration capabilities.

## Key Features

### 1. Source Image Selection
When generating images, you can now:
- **Select specific Amazon product images** as the source/base for generation
- View all available source images with their variant labels (MAIN, PT01, PT02, etc.)
- Choose which image best represents the product for generation
- Leave unselected to use the default (first) source image

**Location**: `/products/[id]/generate`

**How it works**:
- Navigate to the generation page
- Browse the "Select Source Image" section
- Click on any Amazon product image to select it (green border indicates selection)
- Click again to deselect
- The selected image will be used as the base for all generated images in that batch

### 2. Custom Prompts
Add specific instructions to customize the AI generation:
- **Modify size**: "make the diamond smaller", "increase product size"
- **Adjust lighting**: "brighter lighting", "add shadows"
- **Change background**: "white background", "lifestyle setting"
- **Add effects**: "add sparkle", "professional photography style"

**Location**: `/products/[id]/generate`

**How it works**:
- On the generation page, find the "Custom Prompt" textarea
- Enter your specific instructions
- The custom prompt is combined with the image type's default prompt
- All selected image types will use this custom prompt

### 3. Iterative Regeneration
Regenerate any existing image with modifications:
- **Use a generated image as source** for the next generation
- Create iterative improvements (e.g., first generate, then resize, then adjust colors)
- Each regeneration creates a new version while preserving the original
- Track the complete generation chain

**Location**: `/products/[id]` (Product Detail Page)

**How it works**:
1. Hover over any generated image
2. Click the "Regenerate" button that appears
3. Enter a prompt describing the changes (e.g., "make the diamond 30% smaller")
4. Click "Regenerate Image"
5. A new version will be created using the current image as the source

### 4. Generation History Visualization
Visual indicators show the lineage of each generated image:

**Purple badge** 🟣 - "From MAIN" (or PT01, PT02, etc.)
- Indicates which Amazon source image was used

**Orange badge** 🟠 - "Regenerated v2"
- Shows this image was regenerated from a previous version
- Displays the parent version number

**Location**: `/products/[id]` (Product Detail Page)

## Workflow Examples

### Example 1: Basic Generation with Source Selection
1. Go to product → "Generate Images"
2. Select the "MAIN" variant from Amazon images
3. Add custom prompt: "professional white background"
4. Select image types: "Front View", "Lifestyle"
5. Click "Generate"

### Example 2: Iterative Size Adjustment
1. Generate initial image → creates v1
2. View on product detail page
3. Click "Regenerate" on v1
4. Enter prompt: "make the diamond 50% smaller"
5. New v2 is created with smaller diamond
6. Orange badge shows "Regenerated v1"

### Example 3: Multiple Iterations
1. Initial generation (v1) - "professional photography"
2. Regenerate (v2) - "make product smaller"
3. Regenerate (v3) - "add more lighting"
4. Each version tracks its parent
5. Full chain visible: v1 → v2 → v3

## Technical Details

### API Endpoints
**POST** `/api/images/generate`

Request body:
```json
{
  "productId": "string",
  "imageTypeId": "string",
  "sourceImageId": "string (optional)",
  "customPrompt": "string (optional)",
  "parentImageId": "string (optional)"
}
```

### Database Schema
- `GeneratedImage.sourceImageId` - Links to Amazon source image
- `GeneratedImage.parentImageId` - Links to parent generated image for iterations
- `GeneratedImage.version` - Auto-incremented version number per product/type
- `GeneratedImage.promptUsed` - Stores the complete prompt used for generation

### Generation Logic
1. **Source Selection Priority**:
   - Explicit `sourceImageId` (user selected)
   - `parentImageId` (for regeneration)
   - First product source image (default)
   - Text-only generation (if no sources available)

2. **Prompt Construction**:
   - Start with image type default prompt
   - Override with custom prompt if provided
   - Replace template variables: `{product_name}`, `{category}`, `{asin}`
   - Add product sizing instructions

3. **Version Management**:
   - Each product/image type combination has independent versioning
   - Version increments for each new generation
   - Parent-child relationships preserved across versions

## Benefits

1. **Precision Control**: Select exactly which product angle to use
2. **Iterative Refinement**: Make incremental improvements without starting over
3. **Size Adjustments**: Perfect for resizing products (diamonds, jewelry, etc.)
4. **Quality Improvements**: Iteratively enhance lighting, backgrounds, effects
5. **Full Traceability**: Visual indicators show the complete generation history
6. **Non-destructive**: Original images preserved, new versions created

## Future Enhancements
- Batch regeneration with same prompt
- Generation chain visualization graph
- Compare versions side-by-side
- Prompt templates library
- A/B testing for different prompts
