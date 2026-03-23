import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { user } = authResult;

    const { operationName } = await request.json();

    if (!operationName) {
      return NextResponse.json(
        { error: 'Operation name is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Check operation status
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: 'Failed to check video status', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check if video is done
    if (data.done && data.response?.generateVideoResponse?.generatedSamples) {
      const videoUri = data.response.generateVideoResponse.generatedSamples[0]?.video?.uri;

      if (videoUri) {
        // Download the video
        const videoResponse = await fetch(videoUri, {
          headers: {
            'x-goog-api-key': apiKey,
          },
        });

        if (videoResponse.ok) {
          const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          const filename = `generated-${Date.now()}.mp4`;
          const filepath = join(process.cwd(), 'public', 'uploads', filename);

          await writeFile(filepath, videoBuffer);

          return NextResponse.json({
            success: true,
            done: true,
            filename,
            url: `/api/uploads/${filename}`,
            size: videoBuffer.length,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      done: data.done || false,
      operationName,
      message: data.done ? 'Video generation complete' : 'Video generation in progress',
    });
  } catch (error) {
    console.error('Error checking video status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
