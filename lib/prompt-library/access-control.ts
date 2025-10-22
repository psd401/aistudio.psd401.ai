/**
 * Access control for Prompt Library
 */

import { executeSQL } from "@/lib/db/data-api-adapter"
import { hasToolAccess } from "@/utils/roles"

/**
 * Check if user can access the Prompt Library feature
 */
export async function canAccessPromptLibrary(userId?: number): Promise<boolean> {
  if (!userId) return false

  // Using existing tool access system
  return await hasToolAccess("knowledge-repositories")
}

/**
 * Check if user can moderate prompts (admin only)
 */
export async function canModeratePrompts(userId: number): Promise<boolean> {
  const results = await executeSQL<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = :userId`,
    [{ name: "userId", value: { longValue: userId } }]
  )

  return results.length > 0 && results[0].is_admin
}

/**
 * Check if user can read a prompt
 */
export async function canReadPrompt(
  promptId: string,
  userId: number
): Promise<boolean> {
  const results = await executeSQL<{
    user_id: number
    visibility: string
    moderation_status: string
    deleted_at: string | null
  }>(
    `SELECT user_id, visibility, moderation_status, deleted_at
     FROM prompt_library
     WHERE id = :promptId::uuid`,
    [{ name: "promptId", value: { stringValue: promptId } }]
  )

  if (results.length === 0 || results[0].deleted_at) {
    return false
  }

  const prompt = results[0]

  // Owner can always read their own prompts
  if (prompt.user_id === userId) {
    return true
  }

  // Public prompts must be approved to be visible to others
  if (prompt.visibility === 'public' && prompt.moderation_status === 'approved') {
    return true
  }

  // Admins can read any prompt
  const isAdmin = await canModeratePrompts(userId)
  if (isAdmin) {
    return true
  }

  return false
}

/**
 * Check if user can update a prompt
 */
export async function canUpdatePrompt(
  promptId: string,
  userId: number
): Promise<boolean> {
  const results = await executeSQL<{ user_id: number; deleted_at: string | null }>(
    `SELECT user_id, deleted_at FROM prompt_library WHERE id = :promptId::uuid`,
    [{ name: "promptId", value: { stringValue: promptId } }]
  )

  if (results.length === 0 || results[0].deleted_at) {
    return false
  }

  // Only owner can update
  return results[0].user_id === userId
}

/**
 * Check if user can delete a prompt
 */
export async function canDeletePrompt(
  promptId: string,
  userId: number
): Promise<boolean> {
  const results = await executeSQL<{ user_id: number; deleted_at: string | null }>(
    `SELECT user_id, deleted_at FROM prompt_library WHERE id = :promptId::uuid`,
    [{ name: "promptId", value: { stringValue: promptId } }]
  )

  if (results.length === 0 || results[0].deleted_at) {
    return false
  }

  const prompt = results[0]

  // Owner can delete their own prompts
  if (prompt.user_id === userId) {
    return true
  }

  // Admins can delete any prompt
  return await canModeratePrompts(userId)
}

/**
 * Get user ID from session cognito_sub
 */
export async function getUserIdFromSession(cognitoSub: string): Promise<number> {
  const results = await executeSQL<{ id: number }>(
    `SELECT id FROM users WHERE cognito_sub = :cognitoSub`,
    [{ name: "cognitoSub", value: { stringValue: cognitoSub } }]
  )

  if (results.length === 0) {
    throw new Error(`User not found for cognito_sub: ${cognitoSub}`)
  }

  return results[0].id
}
