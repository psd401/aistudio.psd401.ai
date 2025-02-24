"use server"

import { db } from "@/db/db"
import { politicalPromptsTable, aiModelsTable } from "@/db/schema"
import { ActionState, PoliticalWordingResult } from "@/types"
import { eq } from "drizzle-orm"
import { generateCompletion } from "@/lib/ai-helpers"
import { generateLatimierCompletion } from "@/lib/latimer-ai"

export async function analyzePoliticalWordingAction(
  content: string,
  stage: "initial" | "context" | "synthesis",
  previousResults?: PoliticalWordingResult[]
): Promise<ActionState<PoliticalWordingResult>> {
  try {
    // Get the prompt and model configuration for this stage
    const [config] = await db
      .select({
        prompt: politicalPromptsTable.prompt,
        model: aiModelsTable
      })
      .from(politicalPromptsTable)
      .leftJoin(aiModelsTable, eq(politicalPromptsTable.modelId, aiModelsTable.id))
      .where(eq(politicalPromptsTable.stage, stage))

    if (!config?.prompt || !config?.model) {
      return {
        isSuccess: false,
        message: `Stage ${stage} is not properly configured`
      }
    }

    let systemPrompt = config.prompt

    // For context stage, include the context data
    if (stage === "context") {
      const [contextConfig] = await db
        .select({
          prompt: politicalPromptsTable,
          context: politicalContextsTable
        })
        .from(politicalPromptsTable)
        .leftJoin(
          politicalContextsTable,
          eq(politicalPromptsTable.contextId, politicalContextsTable.id)
        )
        .where(eq(politicalPromptsTable.stage, stage))

      if (contextConfig?.context) {
        systemPrompt = `${systemPrompt}\n\nContext:\n${contextConfig.context.content}`
      }
    }

    // For synthesis stage, include previous results
    if (stage === "synthesis" && previousResults) {
      const resultsContext = previousResults
        .map(
          ({ stage, content }) =>
            `Analysis from ${stage} stage:\n${content}\n---\n`
        )
        .join("\n")
      systemPrompt = `${systemPrompt}\n\nPrevious analyses:\n${resultsContext}`
    }

    let result: PoliticalWordingResult

    // Use Latimer.ai for initial analysis
    if (stage === "initial" && config.model.provider === "latimer") {
      const completion = await generateLatimierCompletion(
        {
          apiKey: process.env.LATIMER_API_KEY!
        },
        systemPrompt,
        content
      )
      result = {
        stage,
        content: completion.content,
        model: completion.model
      }
    } else {
      // Use other providers for context and synthesis stages
      const completion = await generateCompletion(
        {
          provider: config.model.provider,
          modelId: config.model.modelId
        },
        systemPrompt,
        content
      )
      result = {
        stage,
        content: completion,
        model: config.model.modelId
      }
    }

    return {
      isSuccess: true,
      message: `${stage} analysis completed`,
      data: result
    }
  } catch (error) {
    console.error(`Error in ${stage} analysis:`, error)
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to analyze content"
    }
  }
} 