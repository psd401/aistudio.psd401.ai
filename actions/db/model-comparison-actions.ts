"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { type ActionState } from "@/types/actions-types"
import { hasToolAccess } from "@/utils/roles"
import { handleError } from "@/lib/error-utils"

export interface ModelComparison {
  id: number
  prompt: string
  model1Name: string
  model2Name: string
  response1: string | null
  response2: string | null
  executionTimeMs1: number | null
  executionTimeMs2: number | null
  tokensUsed1: number | null
  tokensUsed2: number | null
  createdAt: Date
}

export async function getModelComparisons(
  limit: number = 20,
  offset: number = 0
): Promise<ActionState<ModelComparison[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("model-compare")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied" }
    }

    // Get user ID
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :userId",
      [{ name: 'userId', value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = Number(userResult[0].id)

    const comparisons = await executeSQL(
      `SELECT 
        id,
        prompt,
        model1_name,
        model2_name,
        response1,
        response2,
        execution_time_ms1,
        execution_time_ms2,
        tokens_used1,
        tokens_used2,
        created_at
      FROM model_comparisons
      WHERE user_id = :userId
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset`,
      [
        { name: 'userId', value: { longValue: userId } },
        { name: 'limit', value: { longValue: limit } },
        { name: 'offset', value: { longValue: offset } }
      ]
    )

    const formattedComparisons: ModelComparison[] = comparisons.map(row => ({
      id: Number(row.id),
      prompt: String(row.prompt),
      model1Name: String(row.model1_name),
      model2Name: String(row.model2_name),
      response1: row.response1 ? String(row.response1) : null,
      response2: row.response2 ? String(row.response2) : null,
      executionTimeMs1: row.execution_time_ms1 ? Number(row.execution_time_ms1) : null,
      executionTimeMs2: row.execution_time_ms2 ? Number(row.execution_time_ms2) : null,
      tokensUsed1: row.tokens_used1 ? Number(row.tokens_used1) : null,
      tokensUsed2: row.tokens_used2 ? Number(row.tokens_used2) : null,
      createdAt: new Date(String(row.created_at))
    }))

    return {
      isSuccess: true,
      message: "Comparisons retrieved successfully",
      data: formattedComparisons
    }
  } catch (error) {
    return handleError(error, "Failed to retrieve comparisons")
  }
}

export async function getModelComparison(
  comparisonId: number
): Promise<ActionState<ModelComparison>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("model-compare")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied" }
    }

    // Get user ID
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :userId",
      [{ name: 'userId', value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = Number(userResult[0].id)

    const comparisons = await executeSQL(
      `SELECT 
        id,
        prompt,
        model1_name,
        model2_name,
        response1,
        response2,
        execution_time_ms1,
        execution_time_ms2,
        tokens_used1,
        tokens_used2,
        created_at
      FROM model_comparisons
      WHERE id = :comparisonId AND user_id = :userId`,
      [
        { name: 'comparisonId', value: { longValue: comparisonId } },
        { name: 'userId', value: { longValue: userId } }
      ]
    )

    if (comparisons.length === 0) {
      return { isSuccess: false, message: "Comparison not found" }
    }

    const row = comparisons[0]
    const comparison: ModelComparison = {
      id: Number(row.id),
      prompt: String(row.prompt),
      model1Name: String(row.model1_name),
      model2Name: String(row.model2_name),
      response1: row.response1 ? String(row.response1) : null,
      response2: row.response2 ? String(row.response2) : null,
      executionTimeMs1: row.execution_time_ms1 ? Number(row.execution_time_ms1) : null,
      executionTimeMs2: row.execution_time_ms2 ? Number(row.execution_time_ms2) : null,
      tokensUsed1: row.tokens_used1 ? Number(row.tokens_used1) : null,
      tokensUsed2: row.tokens_used2 ? Number(row.tokens_used2) : null,
      createdAt: new Date(String(row.created_at))
    }

    return {
      isSuccess: true,
      message: "Comparison retrieved successfully",
      data: comparison
    }
  } catch (error) {
    return handleError(error, "Failed to retrieve comparison")
  }
}

export async function deleteModelComparison(
  comparisonId: number
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const hasAccess = await hasToolAccess("model-compare")
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied" }
    }

    // Get user ID
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :userId",
      [{ name: 'userId', value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return { isSuccess: false, message: "User not found" }
    }

    const userId = Number(userResult[0].id)

    await executeSQL(
      "DELETE FROM model_comparisons WHERE id = :comparisonId AND user_id = :userId",
      [
        { name: 'comparisonId', value: { longValue: comparisonId } },
        { name: 'userId', value: { longValue: userId } }
      ]
    )

    return {
      isSuccess: true,
      message: "Comparison deleted successfully",
      data: undefined
    }
  } catch (error) {
    return handleError(error, "Failed to delete comparison")
  }
}