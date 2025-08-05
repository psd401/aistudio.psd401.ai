"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, executeTransaction } from "@/lib/db/data-api-adapter"
import { type ActionState } from "@/types/actions-types"
import { hasToolAccess, hasRole } from "@/utils/roles"
import { handleError } from "@/lib/error-utils"
import { createError } from "@/lib/error-utils"
import { revalidatePath } from "next/cache"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"

export interface Repository {
  id: number
  name: string
  description: string | null
  ownerId: number
  isPublic: boolean
  metadata: Record<string, any>
  createdAt: Date
  updatedAt: Date
  ownerName?: string
  itemCount?: number
}

export interface CreateRepositoryInput {
  name: string
  description?: string
  isPublic?: boolean
  metadata?: Record<string, any>
}

export interface UpdateRepositoryInput {
  id: number
  name?: string
  description?: string
  isPublic?: boolean
  metadata?: Record<string, any>
}

/**
 * Check if a user can modify a repository
 * Returns true if the user is the owner or an administrator
 */
async function canModifyRepository(
  repositoryId: number,
  userId: number
): Promise<boolean> {
  // Check if user owns the repository
  const ownerCheck = await executeSQL<{ id: number }>(
    `SELECT 1 as id FROM knowledge_repositories 
     WHERE id = :repositoryId AND owner_id = :userId`,
    [
      { name: "repositoryId", value: { longValue: repositoryId } },
      { name: "userId", value: { longValue: userId } }
    ]
  )
  
  if (ownerCheck.length > 0) return true
  
  // Check if user is administrator
  return await hasRole("administrator")
}

export async function createRepository(
  input: CreateRepositoryInput
): Promise<ActionState<Repository>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
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

    const result = await executeSQL<Repository>(
      `INSERT INTO knowledge_repositories (name, description, owner_id, is_public, metadata)
       VALUES (:name, :description, :owner_id, :is_public, :metadata::jsonb)
       RETURNING *`,
      [
        { name: "name", value: { stringValue: input.name } },
        { name: "description", value: input.description ? { stringValue: input.description } : { isNull: true } },
        { name: "owner_id", value: { longValue: userId } },
        { name: "is_public", value: { booleanValue: input.isPublic || false } },
        { name: "metadata", value: { stringValue: JSON.stringify(input.metadata || {}) } }
      ]
    )

    revalidatePath("/repositories")
    return { isSuccess: true, message: "Repository created successfully", data: result[0] }
  } catch (error) {
    return handleError(error, "Failed to create repository")
  }
}

export async function updateRepository(
  input: UpdateRepositoryInput
): Promise<ActionState<Repository>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
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

    // Check if user can modify this repository
    const canModify = await canModifyRepository(input.id, userId)
    if (!canModify) {
      return { isSuccess: false, message: "Permission denied. Only the repository owner can modify this repository." }
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

    revalidatePath("/repositories")
    revalidatePath(`/repositories/${input.id}`)
    return { isSuccess: true, message: "Repository updated successfully", data: result[0] }
  } catch (error) {
    return handleError(error, "Failed to update repository")
  }
}

export async function deleteRepository(
  id: number
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

    // Get the user ID from the cognito_sub
    const userResult = await executeSQL<{ id: number }>(
      `SELECT id FROM users WHERE cognito_sub = :cognito_sub`,
      [{ name: "cognito_sub", value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = userResult[0].id

    // Check if user can modify this repository
    const canModify = await canModifyRepository(id, userId)
    if (!canModify) {
      return { isSuccess: false, message: "Permission denied. Only the repository owner can delete this repository." }
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

    revalidatePath("/repositories")
    return { isSuccess: true, message: "Repository deleted successfully", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to delete repository")
  }
}

export async function listRepositories(): Promise<ActionState<Repository[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    const repositories = await executeSQL<Repository>(
      `SELECT 
        r.*,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        COUNT(DISTINCT ri.id) as item_count
       FROM knowledge_repositories r
       LEFT JOIN users u ON r.owner_id = u.id
       LEFT JOIN repository_items ri ON r.id = ri.repository_id
       GROUP BY r.id, u.first_name, u.last_name
       ORDER BY r.created_at DESC`
    )

    return { isSuccess: true, message: "Repositories loaded successfully", data: repositories }
  } catch (error) {
    return handleError(error, "Failed to list repositories")
  }
}

export async function getRepository(
  id: number
): Promise<ActionState<Repository>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    const result = await executeSQL<Repository>(
      `SELECT 
        r.*,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        COUNT(DISTINCT ri.id) as item_count
       FROM knowledge_repositories r
       LEFT JOIN users u ON r.owner_id = u.id
       LEFT JOIN repository_items ri ON r.id = ri.repository_id
       WHERE r.id = :id
       GROUP BY r.id, r.name, r.description, r.owner_id, r.is_public, r.metadata, r.created_at, r.updated_at, u.first_name, u.last_name`,
      [{ name: "id", value: { longValue: id } }]
    )

    if (result.length === 0) {
      return { isSuccess: false, message: "Repository not found" }
    }

    return { isSuccess: true, message: "Repository loaded successfully", data: result[0] }
  } catch (error) {
    return handleError(error, "Failed to get repository")
  }
}

export async function getRepositoryAccess(
  repositoryId: number
): Promise<ActionState<any[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    const access = await executeSQL(
      `SELECT 
        ra.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        r.name as role_name
       FROM repository_access ra
       LEFT JOIN users u ON ra.user_id = u.id
       LEFT JOIN roles r ON ra.role_id = r.id
       WHERE ra.repository_id = :repository_id
       ORDER BY ra.created_at DESC`,
      [{ name: "repository_id", value: { longValue: repositoryId } }]
    )

    return { isSuccess: true, message: "Access list loaded successfully", data: access }
  } catch (error) {
    return handleError(error, "Failed to get repository access")
  }
}

export async function grantRepositoryAccess(
  repositoryId: number,
  userId: number | null,
  roleId: number | null,
  accessLevel: 'read' | 'write' | 'admin'
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

    if (!userId && !roleId) {
      return { isSuccess: false, message: "Must specify either user or role" }
    }

    await executeSQL(
      `INSERT INTO repository_access (repository_id, user_id, role_id, access_level)
       VALUES (:repository_id, :user_id, :role_id, :access_level)
       ON CONFLICT DO NOTHING`,
      [
        { name: "repository_id", value: { longValue: repositoryId } },
        { name: "user_id", value: userId ? { longValue: userId } : { isNull: true } },
        { name: "role_id", value: roleId ? { longValue: roleId } : { isNull: true } },
        { name: "access_level", value: { stringValue: accessLevel } }
      ]
    )

    revalidatePath(`/repositories/${repositoryId}`)
    return { isSuccess: true, message: "Access granted successfully", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to grant repository access")
  }
}

export async function revokeRepositoryAccess(
  accessId: number
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
      `DELETE FROM repository_access WHERE id = :id`,
      [{ name: "id", value: { longValue: accessId } }]
    )

    return { isSuccess: true, message: "Access revoked successfully", data: undefined as any }
  } catch (error) {
    return handleError(error, "Failed to revoke repository access")
  }
}

export async function getUserAccessibleRepositoriesAction(): Promise<ActionState<Array<{
  id: number
  name: string
  description: string | null
  isPublic: boolean
  itemCount: number
  lastUpdated: Date | null
}>>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("knowledge-repositories")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied. You need knowledge repository access." }
    }

    // Get the user ID from the cognito_sub
    const userResult = await executeSQL<{ id: number }>(
      `SELECT id FROM users WHERE cognito_sub = :cognitoSub`,
      [{ name: 'cognitoSub', value: { stringValue: session.sub } }]
    )
    
    if (!userResult || userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }
    
    const userId = userResult[0].id

    // Get repositories the user has access to
    const repositories = await executeSQL<any>(
      `WITH accessible_repos AS (
        SELECT DISTINCT r.id, r.name, r.description, r.is_public
        FROM knowledge_repositories r
        WHERE 
          r.is_public = true
          OR r.owner_id = :userId
          OR EXISTS (
            SELECT 1 FROM repository_access ra
            WHERE ra.repository_id = r.id AND ra.user_id = :userId
          )
          OR EXISTS (
            SELECT 1 FROM repository_access ra
            JOIN user_roles ur ON ur.role_id = ra.role_id
            WHERE ra.repository_id = r.id AND ur.user_id = :userId
          )
      )
      SELECT 
        ar.id,
        ar.name,
        ar.description,
        ar.is_public,
        COALESCE(COUNT(ri.id), 0) as item_count,
        MAX(ri.updated_at) as last_updated
      FROM accessible_repos ar
      LEFT JOIN repository_items ri ON ar.id = ri.repository_id
      GROUP BY ar.id, ar.name, ar.description, ar.is_public
      ORDER BY ar.name ASC`,
      [{ name: 'userId', value: { longValue: userId } }]
    )

    // Transform snake_case to camelCase using the standard field mapper
    const transformedRepos = repositories.map(repo => {
      const transformed = transformSnakeToCamel<{
        id: number
        name: string
        description: string | null
        isPublic: boolean
        itemCount: number
        lastUpdated: Date | null
      }>(repo)
      
      // Ensure itemCount is a number
      return {
        ...transformed,
        itemCount: Number(transformed.itemCount) || 0
      }
    })

    return { 
      isSuccess: true, 
      message: "Repositories loaded successfully", 
      data: transformedRepos 
    }
  } catch (error) {
    return handleError(error, "Failed to load accessible repositories")
  }
}