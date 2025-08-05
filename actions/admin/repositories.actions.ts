"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { type ActionState } from "@/types/actions-types"
import { hasRole } from "@/utils/roles"
import { handleError } from "@/lib/error-utils"
import { revalidatePath } from "next/cache"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import type { Repository } from "@/actions/repositories/repository.actions"

export interface RepositoryWithOwner extends Repository {
  ownerEmail: string
}

/**
 * Admin function to list all repositories with owner information
 */
export async function listAllRepositories(): Promise<ActionState<RepositoryWithOwner[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Access denied. Administrator privileges required." }
    }

    const repositories = await executeSQL<RepositoryWithOwner>(
      `SELECT 
        kr.*,
        u.email as owner_email,
        (SELECT COUNT(*) FROM repository_items WHERE repository_id = kr.id) as item_count
       FROM knowledge_repositories kr
       LEFT JOIN users u ON kr.owner_id = u.id
       ORDER BY kr.created_at DESC`
    )

    const transformed = repositories.map(repo => transformSnakeToCamel<RepositoryWithOwner>(repo))
    return { isSuccess: true, message: "Repositories loaded successfully", data: transformed }
  } catch (error) {
    return handleError(error, "Failed to list repositories")
  }
}

/**
 * Admin function to update any repository
 */
export async function adminUpdateRepository(
  input: {
    id: number
    name?: string
    description?: string
    isPublic?: boolean
    metadata?: Record<string, any>
  }
): Promise<ActionState<Repository>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Access denied. Administrator privileges required." }
    }

    const updates: string[] = []
    const params: any[] = [
      { name: "id", value: { longValue: input.id } }
    ]

    if (input.name !== undefined) {
      updates.push("name = :name")
      params.push({ name: "name", value: { stringValue: input.name } })
    }

    if (input.description !== undefined) {
      updates.push("description = :description")
      params.push({ name: "description", value: input.description ? { stringValue: input.description } : { isNull: true } })
    }

    if (input.isPublic !== undefined) {
      updates.push("is_public = :is_public")
      params.push({ name: "is_public", value: { booleanValue: input.isPublic } })
    }

    if (input.metadata !== undefined) {
      updates.push("metadata = :metadata::jsonb")
      params.push({ name: "metadata", value: { stringValue: JSON.stringify(input.metadata) } })
    }

    if (updates.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }

    updates.push("updated_at = CURRENT_TIMESTAMP")

    const result = await executeSQL<Repository>(
      `UPDATE knowledge_repositories 
       SET ${updates.join(", ")}
       WHERE id = :id
       RETURNING *`,
      params
    )

    if (result.length === 0) {
      return { isSuccess: false, message: "Repository not found" }
    }

    revalidatePath("/admin/repositories")
    revalidatePath(`/repositories/${input.id}`)
    return { isSuccess: true, message: "Repository updated successfully (admin)", data: result[0] }
  } catch (error) {
    return handleError(error, "Failed to update repository")
  }
}

/**
 * Admin function to delete any repository
 */
export async function adminDeleteRepository(
  id: number
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Access denied. Administrator privileges required." }
    }

    // First, get all document items to delete from S3
    const items = await executeSQL<{ id: number; type: string; source: string }>(
      `SELECT id, type, source FROM repository_items 
       WHERE repository_id = :repository_id AND type = 'document'`,
      [{ name: "repository_id", value: { longValue: id } }]
    )

    // Delete all documents from S3
    if (items.length > 0) {
      const { deleteDocument } = await import("@/lib/aws/s3-client")
      
      for (const item of items) {
        try {
          await deleteDocument(item.source)
        } catch (error) {
          // Log error but continue with deletion
          console.error(`Failed to delete S3 file ${item.source}:`, error)
        }
      }
    }

    // Now delete the repository (this will cascade delete all items and chunks)
    await executeSQL(
      `DELETE FROM knowledge_repositories WHERE id = :id`,
      [{ name: "id", value: { longValue: id } }]
    )

    revalidatePath("/admin/repositories")
    revalidatePath("/repositories")
    return { isSuccess: true, message: "Repository deleted successfully (admin)", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to delete repository")
  }
}

/**
 * Admin function to get repository items
 */
export async function adminGetRepositoryItems(
  repositoryId: number
): Promise<ActionState<any[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Access denied. Administrator privileges required." }
    }

    const items = await executeSQL(
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

/**
 * Admin function to remove an item from any repository
 */
export async function adminRemoveRepositoryItem(
  itemId: number
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Access denied. Administrator privileges required." }
    }

    // Get the item to check if it's a document (need to delete from S3)
    const items = await executeSQL<{ id: number; type: string; source: string; repositoryId: number }>(
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
        const { deleteDocument } = await import("@/lib/aws/s3-client")
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

    revalidatePath(`/admin/repositories`)
    revalidatePath(`/repositories/${item.repositoryId}`)
    return { isSuccess: true, message: "Item removed successfully (admin)", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to remove item")
  }
}