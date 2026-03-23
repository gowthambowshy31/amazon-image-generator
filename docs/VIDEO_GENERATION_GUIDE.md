# Video Generation Guide

Your Amazon Image Generator platform now supports AI-powered video generation using Google's Veo 3.1 model!

## 🎬 How to Generate Videos for Products

### Step 1: Navigate to Video Generation

1. Go to your product's image generation page
2. Click the **"🎬 Generate Video"** button in the top right corner
3. You'll be taken to the video generation page

### Step 2: Configure Video Settings

On the video generation page, you can customize:

#### **Video Prompt**
- Describe what you want the video to show
- Use template variables:
  - `{product_name}` - Product title
  - `{category}` - Product category
  - `{asin}` - Amazon ASIN

Example prompt:
```
Create a professional product showcase video for {product_name}.
Show the product from multiple angles with smooth camera movements
and professional lighting. Highlight key features and demonstrate
the product in use.
```

#### **Aspect Ratio**
- **16:9** - Landscape (YouTube, website)
- **9:16** - Portrait (TikTok, Instagram Stories, Reels)
- **1:1** - Square (Instagram feed, Facebook)

#### **Duration**
- Choose between **4-8 seconds**
- Longer videos take more time to generate

#### **Resolution**
- **720p** - Good quality, faster generation
- **1080p** - High quality, longer generation time

### Step 3: Generate Video

1. Click **"Generate Video"**
2. The video will start generating (this takes 30-90 seconds typically)
3. You'll see the video appear in the "Generated Videos" section with status "GENERATING"

### Step 4: Check Status

1. Click **"Check Status"** on a generating video
2. If still generating, you'll get a message to check again later
3. Once complete, the video will display in the page
4. Click **"Download Video"** to save it locally

## 📊 API Endpoints

### Generate Video
```bash
POST /api/videos/generate
Content-Type: application/json

{
  "productId": "uuid",
  "prompt": "Create a professional video...",
  "aspectRatio": "16:9",  // optional, default: "16:9"
  "durationSeconds": 4,   // optional, default: 4
  "resolution": "720p"    // optional, default: "720p"
}
```

**Response:**
```json
{
  "success": true,
  "video": {
    "id": "uuid",
    "status": "GENERATING",
    "operationName": "operations/...",
    "promptUsed": "...",
    ...
  },
  "operationName": "operations/...",
  "message": "Video generation started..."
}
```

### Check Video Status
```bash
POST /api/videos/check-status
Content-Type: application/json

{
  "operationName": "operations/...",
  "videoId": "uuid"  // optional
}
```

**Response (Still Generating):**
```json
{
  "done": false,
  "status": "GENERATING",
  "message": "Video is still being generated..."
}
```

**Response (Complete):**
```json
{
  "done": true,
  "video": {
    "id": "uuid",
    "status": "COMPLETED",
    "fileName": "video_123456.mp4",
    "filePath": "/path/to/video.mp4",
    ...
  },
  "url": "/uploads/video_123456.mp4"
}
```

### List Videos for Product
```bash
GET /api/videos?productId=uuid
```

**Response:**
```json
[
  {
    "id": "uuid",
    "productId": "uuid",
    "status": "COMPLETED",
    "fileName": "video_123456.mp4",
    "promptUsed": "...",
    "aspectRatio": "16:9",
    "durationSeconds": 4,
    "resolution": "720p",
    "createdAt": "2026-01-11T...",
    "product": {
      "id": "uuid",
      "title": "Product Name"
    }
  }
]
```

## 🎯 Use Cases

### 1. Product Showcase Videos
Show your product from multiple angles with smooth camera movements.

**Prompt:**
```
Create a 360-degree product showcase video for {product_name}.
Start with a front view, smoothly rotate to show all angles,
highlight key features. Professional studio lighting, white background.
```

### 2. Lifestyle Videos
Show the product in a real-world context.

**Prompt:**
```
Create a lifestyle video showing {product_name} being used in a
modern home setting. Natural lighting, casual environment,
focus on the product's practical benefits.
```

### 3. Feature Highlight Videos
Demonstrate specific product features.

**Prompt:**
```
Create a close-up video highlighting the key features of {product_name}.
Zoom in on important details, show texture and quality,
professional product photography style.
```

### 4. Comparison Videos
Compare product variations or sizes.

**Prompt:**
```
Create a video comparing different sizes/colors of {product_name}.
Show them side by side, smooth transitions between variations,
clean presentation on white background.
```

### 5. Social Media Clips
Short, attention-grabbing videos for social platforms.

**Prompt (9:16 format):**
```
Create a dynamic, eye-catching video of {product_name} for social media.
Fast-paced, trendy style with smooth camera movements.
Show the product in an exciting way that captures attention immediately.
```

## ⚙️ Technical Details

### Model Information
- **AI Model**: Veo 3.1 Generate Preview
- **Provider**: Google Generative AI
- **API**: Google AI Studio / Vertex AI

### Generation Process
1. **Request Sent**: Video generation request is sent to Veo 3.1 API
2. **Long-Running Operation**: API returns an operation name
3. **Asynchronous Processing**: Video generates in the background (30-90 seconds)
4. **Status Checking**: Poll the operation status using the operation name
5. **Video Download**: When complete, video is downloaded as base64 and saved as MP4
6. **Database Update**: Video record is updated with file path and status

### File Storage
- Videos are saved in: `public/uploads/`
- Format: MP4
- Naming: `video_{timestamp}.mp4`
- Access: `/uploads/video_{timestamp}.mp4`

### Database Schema
```prisma
model GeneratedVideo {
  id              String      @id @default(cuid())
  productId       String
  product         Product     @relation(...)
  status          VideoStatus @default(PENDING)
  filePath        String?
  fileName        String?
  fileSize        Int?
  promptUsed      String      @db.Text
  aiModel         String      @default("veo-3.1")
  operationName   String?
  aspectRatio     String      @default("16:9")
  durationSeconds Int         @default(4)
  resolution      String      @default("720p")
  generatedById   String
  generatedBy     User        @relation(...)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

enum VideoStatus {
  PENDING
  GENERATING
  COMPLETED
  FAILED
  APPROVED
  REJECTED
}
```

## 💡 Tips for Better Videos

1. **Be Specific**: Describe camera movements, lighting, and style clearly
2. **Use Context**: Mention the product category for better results
3. **Keep It Simple**: 4-second videos are often enough for product showcases
4. **Choose Right Aspect Ratio**:
   - 16:9 for websites and YouTube
   - 9:16 for mobile-first platforms
   - 1:1 for universal social media posts
5. **Iterate**: Generate multiple variations with different prompts
6. **Check Status Regularly**: Videos typically take 30-90 seconds to generate

## 🚨 Troubleshooting

### Video Generation Fails
- Check `GEMINI_API_KEY` is set in `.env`
- Verify billing is enabled on Google Cloud Console
- Check API quota limits

### Status Check Returns Error
- Make sure to use the correct `operationName`
- Wait at least 30 seconds before checking status
- The operation might have expired (max 24 hours)

### Video Doesn't Play
- Ensure the video file exists in `public/uploads/`
- Check browser supports MP4 format
- Verify file permissions

## 📚 Related Documentation

- [Image Generation Guide](./IMAGE_GENERATION_FEATURES.md)
- [Amazon Integration Guide](./AMAZON_INTEGRATION_GUIDE.md)
- [Gemini API Setup](./GEMINI_API_KEY_SETUP.md)

---

Happy video generating! 🎬✨
