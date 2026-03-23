import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

// Lazy initialization to ensure env vars are loaded
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    })
  }
  return s3Client
}

function getBucketName(): string {
  return process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
}

/**
 * Upload a file buffer to S3
 */
export async function uploadToS3(params: {
  buffer: Buffer
  key: string
  contentType: string
}): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { buffer, key, contentType } = params

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )

    // Return the public URL
    const url = `https://${getBucketName()}.s3.${process.env.AWS_REGION || "eu-north-1"}.amazonaws.com/${key}`

    return { success: true, url }
  } catch (error) {
    console.error("Error uploading to S3:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    )
    return true
  } catch (error) {
    console.error("Error deleting from S3:", error)
    return false
  }
}

/**
 * Get the S3 key from a full S3 URL
 */
export function getS3KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    // Remove leading slash
    return urlObj.pathname.substring(1)
  } catch {
    return null
  }
}

/**
 * Get the public URL for an S3 object
 * Note: This URL will only work if the bucket has appropriate permissions
 * For Amazon SP-API, the bucket needs to grant access to Amazon's Media Download Role
 */
export function getPublicS3Url(key: string): string {
  const bucket = getBucketName()
  const region = process.env.AWS_REGION || "eu-north-1"
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Amazon's Media Download Role ARN
 * This IAM role needs GetObject permission on your S3 bucket for Amazon to fetch images
 */
export const AMAZON_MEDIA_DOWNLOAD_ROLE = "arn:aws:iam::368641386589:role/Media-Download-Role"

/**
 * Generate the bucket policy that grants Amazon's Media Download Role read access
 * This policy should be added to your S3 bucket via AWS Console or CLI
 *
 * @returns The policy object that can be converted to JSON and applied to the bucket
 */
export function generateAmazonAccessPolicy(): object {
  const bucketName = getBucketName()

  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AmazonMediaDownloadAccess",
        Effect: "Allow",
        Principal: {
          AWS: AMAZON_MEDIA_DOWNLOAD_ROLE
        },
        Action: [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ],
        Resource: [
          `arn:aws:s3:::${bucketName}/generated-images/*`,
          `arn:aws:s3:::${bucketName}/external-uploads/*`
        ]
      }
    ]
  }
}

/**
 * Get the current bucket name for display purposes
 */
export function getCurrentBucketName(): string {
  return getBucketName()
}
