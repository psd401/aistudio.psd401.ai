"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, executeTransaction } from "@/lib/db/data-api-adapter"
import { type ActionState } from "@/types/actions-types"
import { hasToolAccess } from "@/utils/roles"
import { handleError } from "@/lib/error-utils"
import { createError } from "@/lib/error-utils"
import { revalidatePath } from "next/cache"
import { uploadDocument, deleteDocument } from "@/lib/aws/s3-client"
import { createJobAction } from "@/actions/db/jobs-actions"
import { queueFileForProcessing, processUrl } from "@/lib/services/file-processing-service"

export interface RepositoryItem {
  id: number
  repositoryId: number
  type: 'document' | 'url' | 'text'
  name: string
  source: string
  metadata: Record<string, any>
  processingStatus: string
  processingError: string | null
  createdAt: Date
  updatedAt: Date
}

export interface RepositoryItemChunk {
  id: number
  itemId: number
  content: string
  embeddingVector: number[] | null
  metadata: Record<string, any>
  chunkIndex: number
  tokens: number | null
  createdAt: Date
}

export interface AddDocumentInput {
  repository_id: number
  name: string
  file: {
    content: Buffer | Uint8Array | string
    contentType: string
    size: number
    fileName?: string
  }
}

export interface AddUrlInput {
  repository_id: number
  name: string
  url: string
}

export interface AddTextInput {
  repository_id: number
  name: string
  content: string
}

// Sanitize filename to prevent directory traversal and other security issues
function sanitizeFilename(filename: string): string {
  // Remove any directory components and special characters
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
    .slice(0, 255); // Limit length
}

export async function addDocumentItem(
  input: AddDocumentInput
): Promise<ActionState<RepositoryItem>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }
    
    // Validate and sanitize inputs
    if (!input.name || input.name.trim().length === 0) {
      return { isSuccess: false, message: "Name is required" }
    }
    
    if (!input.file || !input.file.content) {
      return { isSuccess: false, message: "File content is required" }
    }
    
    // Sanitize the filename
    const sanitizedFilename = sanitizeFilename(input.file.fileName || input.name);

    // Get the user ID from the cognito_sub
    const userResult = await executeSQL<{ id: number }>(
      `SELECT id FROM users WHERE cognito_sub = :cognito_sub`,
      [{ name: "cognito_sub", value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = userResult[0].id

    // Convert base64 string back to Buffer if needed
    let fileContent: Buffer
    if (typeof input.file.content === 'string') {
      // It's a base64 string from the client
      fileContent = Buffer.from(input.file.content, 'base64')
    } else {
      // It's already a Buffer or Uint8Array
      fileContent = Buffer.from(input.file.content)
    }

    // Upload to S3
    const { key, url } = await uploadDocument({
      userId: userId.toString(),
      fileName: sanitizedFilename,
      fileContent,
      contentType: input.file.contentType,
      metadata: {
        repository_id: input.repository_id.toString(),
        type: 'repository_item'
      }
    })

    // Create repository item
    const result = await executeSQL<RepositoryItem>(
      `INSERT INTO repository_items (repository_id, type, name, source, metadata, processing_status)
       VALUES (:repository_id, 'document', :name, :source, :metadata::jsonb, 'pending')
       RETURNING *`,
      [
        { name: "repository_id", value: { longValue: input.repository_id } },
        { name: "name", value: { stringValue: input.name } },
        { name: "source", value: { stringValue: key } },
        { name: "metadata", value: { stringValue: JSON.stringify({
          contentType: input.file.contentType,
          size: input.file.size,
          s3_url: url,
          originalFileName: input.file.fileName
        }) } }
      ]
    )

    const item = result[0]

    // Queue the document for processing
    try {
      await queueFileForProcessing(
        item.id,
        key,
        input.name,
        input.file.contentType
      )
    } catch (error) {
      console.error("Failed to queue file for processing:", error)
      // Don't fail the upload if queueing fails, just log it
    }

    revalidatePath(`/repositories/${input.repository_id}`)
    return { isSuccess: true, message: "Document uploaded successfully", data: item }
  } catch (error) {
    return handleError(error, "Failed to add document")
  }
}

// Validate URL to ensure it's a valid HTTP/HTTPS URL
function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function addUrlItem(
  input: AddUrlInput
): Promise<ActionState<RepositoryItem>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }
    
    // Validate inputs
    if (!input.name || input.name.trim().length === 0) {
      return { isSuccess: false, message: "Name is required" }
    }
    
    if (!input.url || !validateUrl(input.url)) {
      return { isSuccess: false, message: "Valid HTTP/HTTPS URL is required" }
    }

    // Get the user ID from the cognito_sub
    const userResult = await executeSQL<{ id: number }>(
      `SELECT id FROM users WHERE cognito_sub = :cognito_sub`,
      [{ name: "cognito_sub", value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = userResult[0].id

    // Validate URL
    try {
      new URL(input.url)
    } catch {
      return { isSuccess: false, message: "Invalid URL" }
    }

    const result = await executeSQL<RepositoryItem>(
      `INSERT INTO repository_items (repository_id, type, name, source, metadata, processing_status)
       VALUES (:repository_id, 'url', :name, :source, :metadata::jsonb, 'pending')
       RETURNING *`,
      [
        { name: "repository_id", value: { longValue: input.repository_id } },
        { name: "name", value: { stringValue: input.name } },
        { name: "source", value: { stringValue: input.url } },
        { name: "metadata", value: { stringValue: JSON.stringify({}) } }
      ]
    )

    const item = result[0]

    // Process the URL
    try {
      await processUrl(
        item.id,
        input.url,
        input.name
      )
    } catch (error) {
      console.error("Failed to process URL:", error)
      // Don't fail the creation if processing fails, just log it
    }

    revalidatePath(`/repositories/${input.repository_id}`)
    return { isSuccess: true, message: "URL added successfully", data: item }
  } catch (error) {
    return handleError(error, "Failed to add URL")
  }
}

export async function addTextItem(
  input: AddTextInput
): Promise<ActionState<RepositoryItem>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    // Start a transaction to add both the item and its chunk
    const transactionResults = await executeTransaction<{ id: number }>([
      {
        sql: `INSERT INTO repository_items (repository_id, type, name, source, metadata, processing_status)
              VALUES (:repository_id, 'text', :name, :source, :metadata::jsonb, 'completed')
              RETURNING id`,
        parameters: [
          { name: "repository_id", value: { longValue: input.repository_id } },
          { name: "name", value: { stringValue: input.name } },
          { name: "source", value: { stringValue: input.content } },
          { name: "metadata", value: { stringValue: JSON.stringify({
            length: input.content.length
          }) } }
        ]
      }
    ])

    const itemId = transactionResults[0][0].id

    // Add the chunk in a second transaction call
    await executeTransaction([
      {
        sql: `INSERT INTO repository_item_chunks (item_id, content, chunk_index, metadata)
              VALUES (:item_id, :content, 0, :metadata::jsonb)`,
        parameters: [
          { name: "item_id", value: { longValue: itemId } },
          { name: "content", value: { stringValue: input.content } },
          { name: "metadata", value: { stringValue: JSON.stringify({}) } }
        ]
      }
    ])

    // Fetch the created item
    const result = await executeSQL<RepositoryItem>(
      `SELECT * FROM repository_items WHERE id = :id`,
      [{ name: "id", value: { longValue: itemId } }]
    )

    revalidatePath(`/repositories/${input.repository_id}`)
    return { isSuccess: true, message: "Text added successfully", data: result[0] }
  } catch (error) {
    return handleError(error, "Failed to add text")
  }
}

export async function removeRepositoryItem(
  itemId: number
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    // Get the item to check if it's a document (need to delete from S3)
    const items = await executeSQL<RepositoryItem>(
      `SELECT * FROM repository_items WHERE id = :id`,
      [{ name: "id", value: { longValue: itemId } }]
    )

    if (items.length === 0) {
      return { isSuccess: false, message: "Item not found" }
    }

    const item = items[0]

    // Delete from S3 if it's a document
    if (item.type === 'document') {
      try {
        await deleteDocument(item.source)
      } catch (error) {
        // Log error but continue with database deletion
        console.error("Failed to delete from S3:", error)
      }
    }

    // Delete from database (cascades to chunks)
    await executeSQL(
      `DELETE FROM repository_items WHERE id = :id`,
      [{ name: "id", value: { longValue: itemId } }]
    )

    revalidatePath(`/repositories/${item.repositoryId}`)
    return { isSuccess: true, message: "Item removed successfully", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to remove item")
  }
}

export async function listRepositoryItems(
  repositoryId: number
): Promise<ActionState<RepositoryItem[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    const items = await executeSQL<RepositoryItem>(
      `SELECT * FROM repository_items 
       WHERE repository_id = :repository_id
       ORDER BY created_at DESC`,
      [{ name: "repository_id", value: { longValue: repositoryId } }]
    )

    return { isSuccess: true, message: "Items loaded successfully", data: items }
  } catch (error) {
    return handleError(error, "Failed to list repository items")
  }
}

export async function searchRepositoryItems(
  repositoryId: number,
  query: string
): Promise<ActionState<{
  items: RepositoryItem[]
  chunks: RepositoryItemChunk[]
}>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    // Search in item names
    const items = await executeSQL<RepositoryItem>(
      `SELECT * FROM repository_items 
       WHERE repository_id = :repository_id
       AND LOWER(name) LIKE LOWER(:query)
       ORDER BY created_at DESC`,
      [
        { name: "repository_id", value: { longValue: repositoryId } },
        { name: "query", value: { stringValue: `%${query}%` } }
      ]
    )

    // Search in chunk content
    const chunks = await executeSQL<RepositoryItemChunk & { itemName: string }>(
      `SELECT 
        c.*,
        i.name as item_name
       FROM repository_item_chunks c
       JOIN repository_items i ON c.item_id = i.id
       WHERE i.repository_id = :repository_id
       AND LOWER(c.content) LIKE LOWER(:query)
       ORDER BY c.item_id, c.chunk_index
       LIMIT 20`,
      [
        { name: "repository_id", value: { longValue: repositoryId } },
        { name: "query", value: { stringValue: `%${query}%` } }
      ]
    )

    return { isSuccess: true, message: "Search completed successfully", data: { items, chunks } }
  } catch (error) {
    return handleError(error, "Failed to search repository items")
  }
}

export async function getItemChunks(
  itemId: number
): Promise<ActionState<RepositoryItemChunk[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    const chunks = await executeSQL<RepositoryItemChunk>(
      `SELECT * FROM repository_item_chunks 
       WHERE item_id = :item_id
       ORDER BY chunk_index`,
      [{ name: "item_id", value: { longValue: itemId } }]
    )

    return { isSuccess: true, message: "Chunks loaded successfully", data: chunks }
  } catch (error) {
    return handleError(error, "Failed to get item chunks")
  }
}

export async function updateItemProcessingStatus(
  itemId: number,
  status: string,
  error?: string
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    await executeSQL(
      `UPDATE repository_items 
       SET processing_status = :status, 
           processing_error = :error,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      [
        { name: "id", value: { longValue: itemId } },
        { name: "status", value: { stringValue: status } },
        { name: "error", value: error ? { stringValue: error } : { isNull: true } }
      ]
    )

    return { isSuccess: true, message: "Status updated successfully", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to update processing status")
  }
}

export async function getDocumentDownloadUrl(
  itemId: number
): Promise<ActionState<string>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    // Get the item to check if it's a document
    const items = await executeSQL<RepositoryItem>(
      `SELECT * FROM repository_items WHERE id = :id`,
      [{ name: "id", value: { longValue: itemId } }]
    )

    if (items.length === 0) {
      return { isSuccess: false, message: "Item not found" }
    }

    const item = items[0]

    if (item.type !== 'document') {
      return { isSuccess: false, message: "Item is not a document" }
    }

    // Generate a presigned URL for download
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
    
    const s3Client = new S3Client({})
    const bucketName = process.env.DOCUMENTS_BUCKET_NAME
    
    if (!bucketName) {
      return { isSuccess: false, message: "Storage not configured" }
    }

    // Extract file extension from the original S3 key or metadata
    let filename = item.name
    const metadata = item.metadata as any
    
    // Try to get extension from original filename or S3 key
    let extension = ''
    
    if (metadata?.originalFileName) {
      // Use the original filename's extension
      extension = metadata.originalFileName.split('.').pop() || ''
    } else {
      // Extract from S3 key
      const urlParts = item.source.split('/')
      const s3Filename = urlParts[urlParts.length - 1]
      extension = s3Filename.split('.').pop() || ''
    }
    
    // Add extension if not already present in the name
    if (extension && !filename.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
      filename = `${filename}.${extension}`
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: item.source,
      ResponseContentDisposition: `attachment; filename="${filename}"`
    })

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour

    return { isSuccess: true, message: "Download URL generated", data: downloadUrl }
  } catch (error) {
    return handleError(error, "Failed to generate download URL")
  }
}