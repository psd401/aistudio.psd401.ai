import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createError } from "@/lib/error-utils"

const region = process.env.AWS_REGION || "us-east-1"
const bucketName = process.env.S3_BUCKET || "aistudio-documents"

// Initialize S3 client
const s3Client = new S3Client({
  region,
  // In production, this will use IAM role credentials automatically
  // In development, it will use credentials from ~/.aws/credentials or environment variables
})

export interface UploadDocumentParams {
  userId: string
  fileName: string
  fileContent: Buffer | Uint8Array | string
  contentType: string
  metadata?: Record<string, string>
}

export interface DocumentUrlParams {
  key: string
  expiresIn?: number // seconds, default 3600 (1 hour)
}

// Ensure the documents bucket exists
export async function ensureDocumentsBucket(): Promise<void> {
  try {
    // Check if bucket exists
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }))
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      // Create bucket if it doesn't exist
      try {
        await s3Client.send(
          new CreateBucketCommand({
            Bucket: bucketName,
            ...(region !== "us-east-1" && {
              CreateBucketConfiguration: { LocationConstraint: region },
            }),
          })
        )

        // Set CORS configuration for browser uploads
        await s3Client.send(
          new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ["*"],
                  AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                  AllowedOrigins: [
                    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                  ],
                  ExposeHeaders: ["ETag"],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          })
        )
      } catch (createError: any) {
        throw createError("Failed to create S3 bucket", "S3_BUCKET_CREATE_ERROR", {
          error: createError.message,
          bucket: bucketName,
        })
      }
    } else {
      throw createError("Failed to check S3 bucket", "S3_BUCKET_CHECK_ERROR", {
        error: error.message,
        bucket: bucketName,
      })
    }
  }
}

// Upload a document to S3
export async function uploadDocument({
  userId,
  fileName,
  fileContent,
  contentType,
  metadata = {},
}: UploadDocumentParams): Promise<{ key: string; url: string }> {
  await ensureDocumentsBucket()

  const timestamp = Date.now()
  const key = `${userId}/${timestamp}-${fileName}`

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        userId,
        uploadedAt: new Date().toISOString(),
      },
    })

    await s3Client.send(command)

    // Generate a signed URL for immediate access
    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }), { expiresIn: 3600 })

    return { key, url }
  } catch (error: any) {
    throw createError("Failed to upload document to S3", "S3_UPLOAD_ERROR", {
      error: error.message,
      fileName,
    })
  }
}

// Get a signed URL for a document
export async function getDocumentSignedUrl({
  key,
  expiresIn = 3600,
}: DocumentUrlParams): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn })
    return url
  } catch (error: any) {
    throw createError("Failed to generate signed URL", "S3_SIGNED_URL_ERROR", {
      error: error.message,
      key,
    })
  }
}

// Delete a document from S3
export async function deleteDocument(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    await s3Client.send(command)
  } catch (error: any) {
    throw createError("Failed to delete document from S3", "S3_DELETE_ERROR", {
      error: error.message,
      key,
    })
  }
}

// Check if a document exists
export async function documentExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    )
    return true
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw createError("Failed to check document existence", "S3_HEAD_ERROR", {
      error: error.message,
      key,
    })
  }
}

// List documents for a user
export async function listUserDocuments(
  userId: string,
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${userId}/`,
      MaxKeys: maxKeys,
    })

    const response = await s3Client.send(command)
    
    return (response.Contents || []).map((object) => ({
      key: object.Key!,
      size: object.Size || 0,
      lastModified: object.LastModified || new Date(),
    }))
  } catch (error: any) {
    throw createError("Failed to list user documents", "S3_LIST_ERROR", {
      error: error.message,
      userId,
    })
  }
}

// Helper to extract file key from S3 URL
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    // Handle both virtual-hosted-style and path-style URLs
    const pathMatch = urlObj.pathname.match(/^\/([^/]+)\/(.+)$/)
    if (pathMatch && pathMatch[1] === bucketName) {
      return decodeURIComponent(pathMatch[2])
    }
    // For virtual-hosted-style URLs
    if (urlObj.hostname.startsWith(`${bucketName}.`)) {
      return decodeURIComponent(urlObj.pathname.substring(1))
    }
    return null
  } catch {
    return null
  }
}