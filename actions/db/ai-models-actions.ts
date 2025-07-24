"use server"

import { executeSQL } from "@/lib/db/data-api-adapter"
import { ActionState, SelectAiModel } from "@/types"
import logger from "@/lib/logger"

export async function getAiModelsAction(): Promise<ActionState<SelectAiModel[]>> {
  try {
    const models = await executeSQL<SelectAiModel>(`
      SELECT id, name, provider, model_id, description, capabilities, max_tokens, active, chat_enabled, created_at, updated_at
      FROM ai_models
      ORDER BY name ASC
    `);

    return {
      isSuccess: true,
      message: "Models retrieved successfully",
      data: models
    }
  } catch (error) {
    logger.error("Error getting models", { error })
    return { isSuccess: false, message: "Failed to get models" }
  }
} 