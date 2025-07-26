"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, executeTransaction } from "@/lib/db/data-api-adapter"
import { type ActionState } from "@/types/actions-types"
import { requireRole } from "@/lib/auth/role-helpers"
import { handleError } from "@/lib/error-utils"
import { createError } from "@/lib/error-utils"
import { revalidatePath } from "next/cache"
import { uploadDocument, deleteDocument } from "@/lib/aws/s3-client"
import { createJobAction } from "@/actions/db/jobs-actions"
import { queueFileForProcessing, processUrl } from "@/lib/services/file-processing-service"

export interface RepositoryItem {
  id: number
  repository_id: number
  type: 'document' | 'url' | 'text'
  name: string
  source: string
  metadata: Record<string, any>
  processing_status: string
  processing_error: string | null
  created_at: Date
  updated_at: Date
}

export interface RepositoryItemChunk {
  id: number
  item_id: number
  content: string
  embedding_vector: number[] | null
  metadata: Record<string, any>
  chunk_index: number
  tokens: number | null
  created_at: Date
}

export interface AddDocumentInput {
  repository_id: number
  name: string
  file: {
    content: Buffer | Uint8Array | string
    contentType: string
    size: number
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

export async function addDocumentItem(
  input: AddDocumentInput
): Promise<ActionState<RepositoryItem>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    await requireRole("administrator")

    // Get the user ID from the cognito_sub
    const userResult = await executeSQL<{ id: number }>(
      `SELECT id FROM users WHERE cognito_sub = :cognito_sub`,
      [{ name: "cognito_sub", value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = userResult[0].id

    // Upload to S3
    const { key, url } = await uploadDocument({
      userId: userId.toString(),
      fileName: input.name,
      fileContent: input.file.content,
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
          s3_url: url
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

    revalidatePath(`/admin/repositories/${input.repository_id}`)
    return { isSuccess: true, message: "Document uploaded successfully", data: item }
  } catch (error) {
    return handleError(error, "Failed to add document")
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

    await requireRole("administrator")

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

    revalidatePath(`/admin/repositories/${input.repository_id}`)
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

    await requireRole("administrator")

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
        sql: `INSERT INTO document_chunks (item_id, content, chunk_index, metadata)
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

    revalidatePath(`/admin/repositories/${input.repository_id}`)
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

    await requireRole("administrator")

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

    revalidatePath(`/admin/repositories/${item.repository_id}`)
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

    await requireRole("administrator")

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

    await requireRole("administrator")

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
    const chunks = await executeSQL<RepositoryItemChunk & { item_name: string }>(
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

    await requireRole("administrator")

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

    await requireRole("administrator")

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