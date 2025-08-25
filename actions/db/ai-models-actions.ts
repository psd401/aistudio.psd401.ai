"use server"

import { executeSQL } from "@/lib/db/data-api-adapter"
import { ActionState, SelectAiModel } from "@/types"
import { getServerSession } from "@/lib/auth/server-session"
import { 
  handleError,
  ErrorFactories,
  createSuccess
} from "@/lib/error-utils"
import {
  createLogger,
  generateRequestId,
  startTimer
} from "@/lib/logger"

export async function getAiModelsAction(): Promise<ActionState<SelectAiModel[]>> {
  const requestId = generateRequestId()
  const timer = startTimer("getAiModels")
  const log = createLogger({ requestId, action: "getAiModels" })
  
  try {
    log.info("Action started: Getting AI models")
    
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized AI models access attempt")
      throw ErrorFactories.authNoSession()
    }
    
    log.debug("User authenticated", { userId: session.sub })
    
    log.debug("Fetching AI models from database")
    const models = await executeSQL<SelectAiModel>(`
      SELECT id, name, provider, model_id, description, capabilities, max_tokens, active, chat_enabled, 
             created_at, updated_at, allowed_roles,
             input_cost_per_1k_tokens, output_cost_per_1k_tokens, cached_input_cost_per_1k_tokens, pricing_updated_at,
             average_latency_ms, max_concurrency, supports_batching,
             nexus_capabilities, provider_metadata
      FROM ai_models
      ORDER BY name ASC
    `);

    log.info("AI models fetched successfully", {
      modelCount: models.length,
      activeCount: models.filter(m => m.active).length
    })
    
    timer({ status: "success", count: models.length })
    
    return createSuccess(models, "Models retrieved successfully")
  } catch (error) {
    timer({ status: "error" })
    
    return handleError(error, "Failed to get AI models. Please try again or contact support.", {
      context: "getAiModels",
      requestId,
      operation: "getAiModels"
    })
  }
} 