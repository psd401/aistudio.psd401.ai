"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { hasRole } from "@/lib/auth/role-helpers"
import { ActionState } from "@/types/actions-types"
import { createError, createSuccess, handleError } from "@/lib/error-utils"
import logger from "@/lib/logger"
import { revalidateSettingsCache } from "@/lib/settings-manager"

export interface Setting {
  id: number
  key: string
  value: string | null
  description: string | null
  category: string | null
  isSecret: boolean
  hasValue?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateSettingInput {
  key: string
  value: string | null
  description?: string | null
  category?: string | null
  isSecret?: boolean
}

export interface UpdateSettingInput {
  key: string
  value: string | null
  description?: string | null
}

// Get all settings (admin only)
export async function getSettingsAction(): Promise<ActionState<Setting[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return handleError(createError("Unauthorized", { code: "UNAUTHORIZED" }))
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return handleError(createError("Only administrators can view settings", { code: "FORBIDDEN" }))
    }

    const result = await executeSQL(`
      SELECT 
        id,
        key,
        CASE 
          WHEN is_secret = true THEN '••••••••'
          ELSE value
        END as value,
        CASE 
          WHEN value IS NOT NULL AND value != '' THEN true
          ELSE false
        END as has_value,
        description,
        category,
        is_secret,
        created_at,
        updated_at
      FROM settings
      ORDER BY category, key
    `)


    const settings = result.map((record: any) => ({
      id: Number(record.id || 0),
      key: record.key || '',
      value: record.value || null,
      hasValue: record.has_value || false,
      description: record.description || null,
      category: record.category || null,
      isSecret: record.is_secret || false,
      createdAt: new Date(record.created_at || ''),
      updatedAt: new Date(record.updated_at || '')
    }))

    return createSuccess(settings, "Settings retrieved successfully")
  } catch (error) {
    logger.error("Error getting settings:", error)
    return handleError(error)
  }
}

// Get a single setting value (for internal use)
export async function getSettingValueAction(key: string): Promise<string | null> {
  try {
    const result = await executeSQL(
      `SELECT value FROM settings WHERE key = :key`,
      [{ name: 'key', value: { stringValue: key } }]
    )

    if (result && result.length > 0) {
      return result[0].value || null
    }

    return null
  } catch (error) {
    logger.error(`Error getting setting value for ${key}:`, error)
    return null
  }
}

// Create or update a setting (admin only)
export async function upsertSettingAction(input: CreateSettingInput): Promise<ActionState<Setting>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return handleError(createError("Unauthorized", { code: "UNAUTHORIZED" }))
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return handleError(createError("Only administrators can manage settings", { code: "FORBIDDEN" }))
    }

    // Check if setting exists
    const existingResult = await executeSQL(
      `SELECT id FROM settings WHERE key = :key`,
      [{ name: 'key', value: { stringValue: input.key } }]
    )

    let result
    if (existingResult && existingResult.length > 0) {
      // Check if this is a secret being updated with empty value (keep existing)
      const existingIsSecret = await executeSQL(
        `SELECT is_secret, value FROM settings WHERE key = :key`,
        [{ name: 'key', value: { stringValue: input.key } }]
      )
      
      const keepExistingValue = existingIsSecret?.[0]?.is_secret && 
                                !input.value && 
                                existingIsSecret[0].value
      
      // Update existing setting
      if (keepExistingValue) {
        // Update without changing the value
        result = await executeSQL(
          `UPDATE settings 
           SET description = :description, 
               category = :category, 
               is_secret = :isSecret,
               updated_at = NOW()
           WHERE key = :key
           RETURNING id, key, 
             CASE 
               WHEN is_secret = true THEN '••••••••'
               ELSE value
             END as value,
             CASE 
               WHEN value IS NOT NULL AND value != '' THEN true
               ELSE false
             END as has_value,
             description, category, is_secret, created_at, updated_at`,
          [
            { name: 'description', value: input.description ? { stringValue: input.description } : { isNull: true } },
            { name: 'category', value: input.category ? { stringValue: input.category } : { isNull: true } },
            { name: 'isSecret', value: { booleanValue: input.isSecret || false } },
            { name: 'key', value: { stringValue: input.key } }
          ]
        )
      } else {
        // Update including the value
        result = await executeSQL(
          `UPDATE settings 
           SET value = :value, 
               description = :description, 
               category = :category, 
               is_secret = :isSecret,
               updated_at = NOW()
           WHERE key = :key
           RETURNING id, key, 
             CASE 
               WHEN is_secret = true THEN '••••••••'
               ELSE value
             END as value,
             CASE 
               WHEN value IS NOT NULL AND value != '' THEN true
               ELSE false
             END as has_value,
             description, category, is_secret, created_at, updated_at`,
          [
            { name: 'value', value: input.value ? { stringValue: input.value } : { isNull: true } },
            { name: 'description', value: input.description ? { stringValue: input.description } : { isNull: true } },
            { name: 'category', value: input.category ? { stringValue: input.category } : { isNull: true } },
            { name: 'isSecret', value: { booleanValue: input.isSecret || false } },
            { name: 'key', value: { stringValue: input.key } }
          ]
        )
      }
    } else {
      // Create new setting
      result = await executeSQL(
        `INSERT INTO settings (key, value, description, category, is_secret)
         VALUES (:key, :value, :description, :category, :isSecret)
         RETURNING id, key, 
           CASE 
             WHEN is_secret = true THEN '••••••••'
             ELSE value
           END as value,
           CASE 
             WHEN value IS NOT NULL AND value != '' THEN true
             ELSE false
           END as has_value,
           description, category, is_secret, created_at, updated_at`,
        [
          { name: 'key', value: { stringValue: input.key } },
          { name: 'value', value: input.value ? { stringValue: input.value } : { isNull: true } },
          { name: 'description', value: input.description ? { stringValue: input.description } : { isNull: true } },
          { name: 'category', value: input.category ? { stringValue: input.category } : { isNull: true } },
          { name: 'isSecret', value: { booleanValue: input.isSecret || false } }
        ]
      )
    }

    if (!result || result.length === 0) {
      throw createError("Failed to save setting")
    }

    const record = result[0]
    const setting: Setting = {
      id: Number(record.id || 0),
      key: record.key || '',
      value: record.value || null,
      hasValue: record.has_value || false,
      description: record.description || null,
      category: record.category || null,
      isSecret: record.is_secret || false,
      createdAt: new Date(record.created_at || ''),
      updatedAt: new Date(record.updated_at || '')
    }

    // Invalidate the settings cache
    await revalidateSettingsCache()

    return createSuccess(setting, "Setting saved successfully")
  } catch (error) {
    logger.error("Error saving setting:", error)
    return handleError(error)
  }
}

// Delete a setting (admin only)
export async function deleteSettingAction(key: string): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return handleError(createError("Unauthorized", { code: "UNAUTHORIZED" }))
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return handleError(createError("Only administrators can delete settings", { code: "FORBIDDEN" }))
    }

    await executeSQL(
      `DELETE FROM settings WHERE key = :key`,
      [{ name: 'key', value: { stringValue: key } }]
    )

    // Invalidate the settings cache
    await revalidateSettingsCache()

    return createSuccess(undefined, "Setting deleted successfully")
  } catch (error) {
    logger.error("Error deleting setting:", error)
    return handleError(error)
  }
}

// Get actual (unmasked) value for a secret setting (admin only)
export async function getSettingActualValueAction(key: string): Promise<ActionState<string | null>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return handleError(createError("Unauthorized", { code: "UNAUTHORIZED" }))
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return handleError(createError("Only administrators can view secret values", { code: "FORBIDDEN" }))
    }

    const result = await executeSQL(
      `SELECT value FROM settings WHERE key = :key`,
      [{ name: 'key', value: { stringValue: key } }]
    )

    if (result && result.length > 0) {
      return createSuccess(result[0].value || null, "Value retrieved successfully")
    }

    return createSuccess(null, "Setting not found")
  } catch (error) {
    logger.error(`Error getting actual value for ${key}:`, error)
    return handleError(error)
  }
}

// Test API connection (admin only)
export async function testSettingConnectionAction(key: string, value: string): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return handleError(createError("Unauthorized", { code: "UNAUTHORIZED" }))
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return handleError(createError("Only administrators can test settings", { code: "FORBIDDEN" }))
    }

    // Test based on the key type
    switch (key) {
      case 'AZURE_OPENAI_KEY':
        // TODO: Implement Azure OpenAI test
        return createSuccess(undefined, "Azure OpenAI connection test not yet implemented")
      
      case 'GOOGLE_API_KEY':
        // TODO: Implement Google AI test
        return createSuccess(undefined, "Google AI connection test not yet implemented")
      
      case 'S3_BUCKET':
        // TODO: Implement S3 bucket test
        return createSuccess(undefined, "S3 bucket connection test not yet implemented")
      
      case 'GITHUB_ISSUE_TOKEN':
        // TODO: Implement GitHub token test
        return createSuccess(undefined, "GitHub token test not yet implemented")
      
      default:
        return createSuccess(undefined, "Connection test not available for this setting")
    }
  } catch (error) {
    logger.error("Error testing setting connection:", error)
    return handleError(error)
  }
}