"use server"

import { db } from "@/db/query"
import { 
  politicalContextsTable, 
  politicalPromptsTable, 
  politicalSettingsTable,
  aiModelsTable,
  InsertPoliticalContext,
  SelectPoliticalContext,
  InsertPoliticalPrompt,
  SelectPoliticalPrompt,
  SelectPoliticalSettings
} from "@/db/schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"
import { generateCompletion } from "@/lib/ai-helpers"
import { generateLatimierCompletion } from "@/lib/latimer-ai"

// Context Actions
export async function createPoliticalContextAction(
  context: InsertPoliticalContext
): Promise<ActionState<SelectPoliticalContext>> {
  try {
    const [newContext] = await db
      .insert(politicalContextsTable)
      .values(context)
      .returning()
    return {
      isSuccess: true,
      message: "Context created successfully",
      data: newContext
    }
  } catch (error) {
    console.error("Error creating context:", error)
    return { isSuccess: false, message: "Failed to create context" }
  }
}

export async function getPoliticalContextsAction(): Promise<ActionState<SelectPoliticalContext[]>> {
  try {
    const contexts = await db.select().from(politicalContextsTable)
    return {
      isSuccess: true,
      message: "Contexts retrieved successfully",
      data: contexts
    }
  } catch (error) {
    console.error("Error getting contexts:", error)
    return { isSuccess: false, message: "Failed to get contexts" }
  }
}

export async function updatePoliticalContextAction(
  id: string,
  data: Partial<InsertPoliticalContext>
): Promise<ActionState<SelectPoliticalContext>> {
  try {
    const [updatedContext] = await db
      .update(politicalContextsTable)
      .set(data)
      .where(eq(politicalContextsTable.id, id))
      .returning()
    return {
      isSuccess: true,
      message: "Context updated successfully",
      data: updatedContext
    }
  } catch (error) {
    console.error("Error updating context:", error)
    return { isSuccess: false, message: "Failed to update context" }
  }
}

export async function deletePoliticalContextAction(id: string): Promise<ActionState<void>> {
  try {
    await db.delete(politicalContextsTable).where(eq(politicalContextsTable.id, id))
    return {
      isSuccess: true,
      message: "Context deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting context:", error)
    return { isSuccess: false, message: "Failed to delete context" }
  }
}

// Prompt Actions
export async function createPoliticalPromptAction(
  prompt: InsertPoliticalPrompt
): Promise<ActionState<SelectPoliticalPrompt>> {
  try {
    const [newPrompt] = await db
      .insert(politicalPromptsTable)
      .values(prompt)
      .returning()
    return {
      isSuccess: true,
      message: "Prompt created successfully",
      data: newPrompt
    }
  } catch (error) {
    console.error("Error creating prompt:", error)
    return { isSuccess: false, message: "Failed to create prompt" }
  }
}

export async function getPoliticalPromptsAction(): Promise<ActionState<SelectPoliticalPrompt[]>> {
  try {
    const prompts = await db.select().from(politicalPromptsTable)
    return {
      isSuccess: true,
      message: "Prompts retrieved successfully",
      data: prompts
    }
  } catch (error) {
    console.error("Error getting prompts:", error)
    return { isSuccess: false, message: "Failed to get prompts" }
  }
}

export async function updatePoliticalPromptAction(
  id: string,
  data: Partial<InsertPoliticalPrompt>
): Promise<ActionState<SelectPoliticalPrompt>> {
  try {
    const [updatedPrompt] = await db
      .update(politicalPromptsTable)
      .set(data)
      .where(eq(politicalPromptsTable.id, id))
      .returning()
    return {
      isSuccess: true,
      message: "Prompt updated successfully",
      data: updatedPrompt
    }
  } catch (error) {
    console.error("Error updating prompt:", error)
    return { isSuccess: false, message: "Failed to update prompt" }
  }
}

export async function deletePoliticalPromptAction(
  id: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(politicalPromptsTable)
      .where(eq(politicalPromptsTable.id, id))

    return {
      isSuccess: true,
      message: "Prompt deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting prompt:", error)
    return { isSuccess: false, message: "Failed to delete prompt" }
  }
}

// Settings Actions
export async function getPoliticalSettingsAction(): Promise<ActionState<SelectPoliticalSettings>> {
  try {
    const [settings] = await db.select().from(politicalSettingsTable).limit(1)
    return {
      isSuccess: true,
      message: "Settings retrieved successfully",
      data: settings
    }
  } catch (error) {
    console.error("Error getting settings:", error)
    return { isSuccess: false, message: "Failed to get settings" }
  }
}

export async function updatePoliticalSettingsAction(
  data: Partial<SelectPoliticalSettings>
): Promise<ActionState<SelectPoliticalSettings>> {
  try {
    const [settings] = await db.select().from(politicalSettingsTable).limit(1)
    const [updatedSettings] = await db
      .update(politicalSettingsTable)
      .set(data)
      .where(eq(politicalSettingsTable.id, settings.id))
      .returning()
    return {
      isSuccess: true,
      message: "Settings updated successfully",
      data: updatedSettings
    }
  } catch (error) {
    console.error("Error updating settings:", error)
    return { isSuccess: false, message: "Failed to update settings" }
  }
}

export async function analyzePoliticalWordingAction(
  content: string,
  stage: "initial" | "context" | "synthesis",
  previousResults?: Array<{ stage: string; result: string }>
): Promise<ActionState<PoliticalWordingResult>> {
  try {
    // Get the prompt configuration for this stage
    const [config] = await db
      .select({
        prompt: politicalPromptsTable,
        model: aiModelsTable,
        context: politicalContextsTable
      })
      .from(politicalPromptsTable)
      .leftJoin(aiModelsTable, eq(politicalPromptsTable.modelId, aiModelsTable.id))
      .leftJoin(politicalContextsTable, eq(politicalPromptsTable.contextId, politicalContextsTable.id))
      .where(eq(politicalPromptsTable.stage, stage))

    if (!config?.prompt) {
      return {
        isSuccess: false,
        message: `Stage ${stage} is not properly configured`
      }
    }

    let systemPrompt = config.prompt.content

    // For context stage, include the context data
    if (stage === "context" && config.context) {
      systemPrompt = `${systemPrompt}\n\nContext:\n${config.context.content}`
    }

    // For synthesis stage, include previous results
    if (stage === "synthesis" && previousResults) {
      const resultsContext = previousResults
        .map(({ stage, result }, index) => `
=== ${stage.toUpperCase()} ANALYSIS (Analysis #${index + 1}) ===
${result}
=== END ${stage.toUpperCase()} ANALYSIS ===\n`)
        .join("\n")
      systemPrompt = `${systemPrompt}\n\nPrevious Analyses:\n${resultsContext}\n\nPlease synthesize these two distinct analyses above into a final recommendation.`
    }

    // Use Latimer.ai for initial stage if configured
    if (stage === "initial" && config.prompt.usesLatimer) {
      console.log("Skipping Latimer.ai due to API issues, using configured model instead")
      
      if (!config.model) {
        return {
          isSuccess: false,
          message: `No AI model configured for stage ${stage}`
        }
      }

      const completion = await generateCompletion(
        {
          provider: config.model.provider,
          modelId: config.model.modelId
        },
        systemPrompt,
        content
      )

      return {
        isSuccess: true,
        message: "Analysis completed",
        data: {
          stage,
          content: completion,
          model: config.model.modelId
        }
      }
    }

    // Otherwise use the configured AI model
    if (!config.model) {
      return {
        isSuccess: false,
        message: `No AI model configured for stage ${stage}`
      }
    }

    const completion = await generateCompletion(
      {
        provider: config.model.provider,
        modelId: config.model.modelId
      },
      systemPrompt,
      content
    )

    return {
      isSuccess: true,
      message: "Analysis completed",
      data: {
        stage,
        content: completion,
        model: config.model.modelId
      }
    }
  } catch (error) {
    console.error("Error analyzing political wording:", error)
    return { isSuccess: false, message: "Failed to analyze political wording" }
  }
} 