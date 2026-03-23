# Amazon Product Import Guide

## Quick Start

Your Amazon Image Generator platform is ready to import products from Amazon and generate professional images!

## 🚀 Getting Started

### Step 1: Login
1. Go to: http://localhost:3000
2. You'll be redirected to `/login`
3. Use default credentials:
   - **Email**: `admin@imageGen.com`
   - **Password**: `admin123`

### Step 2: Import Amazon Product

#### Option A: Via Dashboard
1. After login, you'll see the **Dashboard**
2. Click **"Add Product"** or **"Import from Amazon"** button
3. Enter the **ASIN** (Amazon Standard Identification Number)
   - Example ASINs: `B08N5WRWNW`, `B07ZPKN6YR`
4. Check **"Auto-create product"** to automatically create the product
5. Click **"Fetch from Amazon"**

#### Option B: Via API
```bash
curl -X POST http://localhost:3000/api/amazon/fetch-product \
  -H "Content-Type: application/json" \
  -d '{
    "asin": "B08N5WRWNW",
    "autoCreateProduct": true
  }'
```

### Step 3: Generate Images

Once a product is imported:

1. **View Product Details**
   - Click on the product from dashboard
   - See all imported source images from Amazon

2. **Select Image Types** to generate:
   - Front View
   - Side View
   - Top View
   - Lifestyle
   - Detail Shot
   - Packaging
   - Infographic

3. **Generate Images**
   - Select one or multiple image types
   - Images are generated using **Gemini 2.5 Flash Image**
   - Each generation creates a new version
   - Images are optimized for Amazon listings

4. **Review & Approve**
   - View generated images
   - Approve, reject, or request changes
   - Add comments and feedback
   - Track version history

## 📋 Amazon API Configuration

Your Amazon SP-API credentials are already configured in `.env`:

```env
AMAZON_REGION="na"
AMAZON_MARKETPLACE_ID="your-marketplace-id"
AMAZON_CLIENT_ID="your-client-id"
AMAZON_CLIENT_SECRET="your-client-secret"
AMAZON_REFRESH_TOKEN="your-refresh-token"
```

## 🎨 Image Generation Features

### AI-Powered Generation
- **Model**: Gemini 2.5 Flash Image (Latest & Most Advanced)
- **Quality**: Professional Amazon listing quality
- **Speed**: ~5-10 seconds per image
- **Customization**: Adjustable product sizing and prompts

### Image Types
1. **Front View** - Main product shot
2. **Side View** - Product from the side
3. **Top View** - Bird's eye view
4. **Lifestyle** - Product in use/context
5. **Detail Shot** - Close-up of features
6. **Packaging** - Product packaging
7. **Infographic** - Feature comparison/specs

### Prompt System
Prompts support variables:
- `{product_name}` - Product title
- `{category}` - Product category
- `{asin}` - Amazon ASIN

Example:
```
Professional photo of {product_name} on white background,
front view with studio lighting, Amazon listing quality
```

## 🔄 Workflow

1. **Import** → Fetch product from Amazon by ASIN
2. **Review** → Check imported images and details
3. **Generate** → Create AI images for different types
4. **Iterate** → Regenerate based on feedback
5. **Approve** → Mark images as ready for use
6. **Export** → Download approved images

## 📊 Features Available

✅ **Amazon Integration**
- Import products by ASIN
- Fetch product images and details
- Auto-download source images

✅ **AI Image Generation**
- Text-to-image using Gemini 2.5 Flash
- Multiple image types
- Version control
- Custom prompts per product

✅ **Workflow Management**
- Product status tracking
- Image approval workflow
- Comments and feedback
- Activity logs

✅ **Analytics**
- Images generated per day
- Approval rates
- Product progress tracking

## 🛠️ Troubleshooting

### Can't Import Products
- Verify Amazon API credentials in `.env`
- Check ASIN is valid (10 characters)
- Ensure PostgreSQL database is running
- Check you're logged in

### Images Not Generating
- Verify `GEMINI_API_KEY` in `.env`
- Check billing is enabled on Google Cloud
- Ensure `public/uploads` directory exists
- Check API quota limits

### Authentication Issues
- Use credentials: `admin@imageGen.com` / `admin123`
- Clear browser cookies if stuck
- Check `NEXTAUTH_SECRET` is set in `.env`

## 📚 API Endpoints

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product manually
- `GET /api/products/[id]` - Get product details
- `PATCH /api/products/[id]` - Update product
- `DELETE /api/products/[id]` - Delete product

### Amazon Integration
- `POST /api/amazon/fetch-product` - Import from Amazon
  ```json
  {
    "asin": "B08N5WRWNW",
    "autoCreateProduct": true
  }
  ```

### Image Generation
- `POST /api/images/generate` - Generate single image
  ```json
  {
    "productId": "uuid",
    "imageTypeId": "uuid",
    "sourceImageId": "uuid" // optional
  }
  ```

- `POST /api/images/bulk-generate` - Generate multiple images
  ```json
  {
    "productIds": ["uuid1", "uuid2"],
    "imageTypeIds": ["uuid1", "uuid2"]
  }
  ```

## 💡 Tips

1. **Best ASINs**: Use ASINs from products with good source images
2. **Prompt Customization**: Customize prompts for better results
3. **Bulk Generation**: Generate multiple images at once to save time
4. **Version Control**: Keep track of iterations for comparison
5. **Source Images**: Use high-quality Amazon images for best results

## 🎯 Next Steps

1. Login at http://localhost:3000
2. Import your first Amazon product
3. Generate images for different views
4. Review and approve the best ones
5. Scale up with bulk generation!

Happy generating! 🚀
