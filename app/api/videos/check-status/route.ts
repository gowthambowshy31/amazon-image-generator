import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { getSeedanceTask } from "@/lib/seedance"

// POST /api/videos/check-status - Check video generation status
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { operationName, videoId } = await request.json()

    if (!operationName) {
      return NextResponse.json(
        { error: "Operation name is required" },
        { status: 400 }
      )
    }

    // Determine provider from the persisted video record (fallback: operation shape).
    let existingVideo = videoId
      ? await prisma.generatedVideo.findUnique({ where: { id: videoId } })
      : null

    if (existingVideo?.status === "COMPLETED") {
      return NextResponse.json({
        done: true,
        video: existingVideo,
        url: `/api/uploads/${existingVideo.fileName}`,
        message: "Video already completed",
      })
    }

    if (existingVideo?.status === "FAILED") {
      return NextResponse.json({
        done: true,
        status: "FAILED",
        message: "Video generation failed",
      })
    }

    const isSeedance =
      (existingVideo?.aiModel || "").startsWith("doubao-seedance") ||
      // Seedance task IDs start with `cgt-`, Veo operation names start with `operations/`.
      (!operationName.startsWith("operations/") && operationName.startsWith("cgt-"))

    if (isSeedance) {
      return await handleSeedance(operationName, videoId)
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      )
    }

    // Check operation status
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey
        }
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      console.error('Status check error:', errorData)
      return NextResponse.json(
        {
          error: "Failed to check video status",
          details: errorData,
          message: errorData.error?.message || errorData.message || "Unknown error from video generation API"
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Check if operation is done
    if (data.done) {
      console.log('✅ Video generation complete!')

      // Extract video URI from the new response format
      const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri

      if (!videoUri) {
        console.error('❌ No video URI found in response. Available keys:', Object.keys(data))
        console.error('Response object:', JSON.stringify(data, null, 2))

        // Update video record as failed
        if (videoId) {
          await prisma.generatedVideo.update({
            where: { id: videoId },
            data: { status: 'FAILED' }
          })
        }
        return NextResponse.json(
          { error: "No video URI in response", responseStructure: Object.keys(data) },
          { status: 500 }
        )
      }

      console.log('📥 Downloading video from URI:', videoUri)

      // Download video from URI
      const videoResponse = await fetch(videoUri, {
        headers: {
          'x-goog-api-key': apiKey
        }
      })

      if (!videoResponse.ok) {
        console.error('❌ Failed to download video:', videoResponse.status, videoResponse.statusText)
        if (videoId) {
          await prisma.generatedVideo.update({
            where: { id: videoId },
            data: { status: 'FAILED' }
          })
        }
        return NextResponse.json(
          { error: "Failed to download video from URI" },
          { status: 500 }
        )
      }

      // Get video buffer from response
      const videoArrayBuffer = await videoResponse.arrayBuffer()
      const videoBuffer = Buffer.from(videoArrayBuffer)
      const timestamp = Date.now()
      const fileName = `video_${timestamp}.mp4`
      const uploadDir = path.join(process.cwd(), 'public', 'uploads')

      // Ensure upload directory exists
      try {
        await mkdir(uploadDir, { recursive: true })
      } catch (err) {
        // Directory might already exist
      }

      const filePath = path.join(uploadDir, fileName)
      await writeFile(filePath, videoBuffer)

      const fileSize = videoBuffer.length

      console.log(`💾 Video saved: ${fileName} (${fileSize} bytes)`)

      // Update video record if videoId provided
      if (videoId) {
        const updatedVideo = await prisma.generatedVideo.update({
          where: { id: videoId },
          data: {
            status: 'COMPLETED',
            fileName,
            filePath,
            fileSize
          },
          include: {
            product: true,
            videoType: {
              select: {
                id: true,
                name: true,
                description: true
              }
            },
            sourceImage: {
              select: {
                id: true,
                variant: true,
                localFilePath: true
              }
            },
            generatedImage: {
              select: {
                id: true,
                fileName: true,
                imageType: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        })

        return NextResponse.json({
          done: true,
          video: updatedVideo,
          url: `/api/uploads/${fileName}`
        })
      }

      return NextResponse.json({
        done: true,
        fileName,
        url: `/api/uploads/${fileName}`,
        fileSize
      })
    } else {
      // Still generating
      return NextResponse.json({
        done: false,
        status: 'GENERATING',
        message: 'Video is still being generated. Please check again in a few seconds.'
      })
    }
  } catch (error) {
    console.error("Error checking video status:", error)
    return NextResponse.json(
      { error: "Failed to check video status" },
      { status: 500 }
    )
  }
}

async function handleSeedance(taskId: string, videoId?: string) {
  let task
  try {
    task = await getSeedanceTask(taskId)
  } catch (err) {
    console.error("Seedance status check error:", err)
    return NextResponse.json(
      {
        error: "Failed to check Seedance status",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  if (task.status === "failed" || task.status === "cancelled" || task.status === "expired") {
    if (videoId) {
      await prisma.generatedVideo.update({
        where: { id: videoId },
        data: { status: "FAILED" },
      })
    }
    return NextResponse.json({
      done: true,
      status: "FAILED",
      message: task.error?.message || `Seedance task ${task.status}`,
    })
  }

  if (task.status !== "succeeded") {
    return NextResponse.json({
      done: false,
      status: "GENERATING",
      message: `Seedance task ${task.status}. Please check again in a few seconds.`,
    })
  }

  const videoUrl = task.content?.video_url
  if (!videoUrl) {
    if (videoId) {
      await prisma.generatedVideo.update({
        where: { id: videoId },
        data: { status: "FAILED" },
      })
    }
    return NextResponse.json(
      { error: "Seedance succeeded but no video_url in response" },
      { status: 500 }
    )
  }

  console.log("📥 Downloading Seedance video from:", videoUrl)
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    if (videoId) {
      await prisma.generatedVideo.update({
        where: { id: videoId },
        data: { status: "FAILED" },
      })
    }
    return NextResponse.json(
      { error: "Failed to download Seedance video" },
      { status: 500 }
    )
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
  const timestamp = Date.now()
  const fileName = `video_${timestamp}.mp4`
  const uploadDir = path.join(process.cwd(), "public", "uploads")
  try {
    await mkdir(uploadDir, { recursive: true })
  } catch {}
  const filePath = path.join(uploadDir, fileName)
  await writeFile(filePath, videoBuffer)

  console.log(`💾 Seedance video saved: ${fileName} (${videoBuffer.length} bytes)`)

  if (videoId) {
    const updatedVideo = await prisma.generatedVideo.update({
      where: { id: videoId },
      data: {
        status: "COMPLETED",
        fileName,
        filePath,
        fileSize: videoBuffer.length,
      },
      include: {
        product: true,
        videoType: { select: { id: true, name: true, description: true } },
        sourceImage: {
          select: { id: true, variant: true, localFilePath: true },
        },
        generatedImage: {
          select: {
            id: true,
            fileName: true,
            imageType: { select: { id: true, name: true } },
          },
        },
      },
    })
    return NextResponse.json({
      done: true,
      video: updatedVideo,
      url: `/api/uploads/${fileName}`,
    })
  }

  return NextResponse.json({
    done: true,
    fileName,
    url: `/api/uploads/${fileName}`,
    fileSize: videoBuffer.length,
  })
}
