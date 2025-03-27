"use server"

import { db } from "@/db/query"
import { 
  InsertAudience, 
  SelectAudience, 
  audiencesTable,
  accessControlTable,
  SelectAccessControl,
  InsertAccessControl,
  analysisPromptsTable,
  aiModelsTable
} from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"

// Audience Actions
export async function createAudienceAction(
  audience: InsertAudience
): Promise<ActionState<SelectAudience>> {
  try {
    const [newAudience] = await db
      .insert(audiencesTable)
      .values(audience)
      .returning()

    return {
      isSuccess: true,
      message: "Audience created successfully",
      data: newAudience
    }
  } catch (error) {
    console.error("Error creating audience:", error)
    return { isSuccess: false, message: "Failed to create audience" }
  }
}

export async function getAudiencesAction(): Promise<ActionState<SelectAudience[]>> {
  try {
    const audiences = await db.select().from(audiencesTable)
    return {
      isSuccess: true,
      message: "Audiences retrieved successfully",
      data: audiences
    }
  } catch (error) {
    console.error("Error getting audiences:", error)
    return { isSuccess: false, message: "Failed to get audiences" }
  }
}

export async function updateAudienceAction(
  id: string,
  data: Partial<InsertAudience>
): Promise<ActionState<SelectAudience>> {
  try {
    const [updatedAudience] = await db
      .update(audiencesTable)
      .set(data)
      .where(eq(audiencesTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Audience updated successfully",
      data: updatedAudience
    }
  } catch (error) {
    console.error("Error updating audience:", error)
    return { isSuccess: false, message: "Failed to update audience" }
  }
}

export async function deleteAudienceAction(
  id: string
): Promise<ActionState<void>> {
  try {
    await db.delete(audiencesTable).where(eq(audiencesTable.id, id))
    return {
      isSuccess: true,
      message: "Audience deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting audience:", error)
    return { isSuccess: false, message: "Failed to delete audience" }
  }
}

// Access Control Actions
export async function getAccessControlsAction(): Promise<ActionState<SelectAccessControl[]>> {
  try {
    const accessControls = await db.select().from(accessControlTable)
    return {
      isSuccess: true,
      message: "Access controls retrieved successfully",
      data: accessControls
    }
  } catch (error) {
    console.error("Error getting access controls:", error)
    return { isSuccess: false, message: "Failed to get access controls" }
  }
}

export async function updateAccessControlAction(
  userId: string,
  data: Partial<InsertAccessControl>
): Promise<ActionState<SelectAccessControl>> {
  try {
    const [existingControl] = await db
      .select()
      .from(accessControlTable)
      .where(eq(accessControlTable.userId, userId));

    if (existingControl) {
      // Update existing access control
      const [updatedControl] = await db
        .update(accessControlTable)
        .set(data)
        .where(eq(accessControlTable.userId, userId))
        .returning()

      return {
        isSuccess: true,
        message: "Access control updated successfully",
        data: updatedControl
      }
    } else {
      // Create new access control
      const [newControl] = await db
        .insert(accessControlTable)
        .values({ userId, ...data })
        .returning()

      return {
        isSuccess: true,
        message: "Access control created successfully",
        data: newControl
      }
    }
  } catch (error) {
    console.error("Error updating access control:", error)
    return { isSuccess: false, message: "Failed to update access control" }
  }
}

interface UpsertPromptParams {
  audienceId?: string
  prompt?: string
  isMetaAnalysis: boolean
  modelId?: string
}

export async function upsertPromptAction(
  params: UpsertPromptParams
): Promise<ActionState<any>> {
  try {
    const { audienceId, prompt, isMetaAnalysis, modelId } = params

    // Verify the model exists if provided
    if (modelId) {
      const [model] = await db
        .select()
        .from(aiModelsTable)
        .where(eq(aiModelsTable.id, parseInt(modelId)))

      if (!model) {
        return { isSuccess: false, message: "Model not found" }
      }
    }

    // Find existing prompt
    const existingPrompts = await db
      .select()
      .from(analysisPromptsTable)
      .where(
        isMetaAnalysis
          ? eq(analysisPromptsTable.isMetaAnalysis, true)
          : and(
              eq(analysisPromptsTable.audienceId, audienceId!),
              eq(analysisPromptsTable.isMetaAnalysis, false)
            )
      )

    let updatedPrompt
    if (existingPrompts.length > 0) {
      // Update existing prompt
      const updates: Partial<typeof analysisPromptsTable.$inferInsert> = {
        updatedAt: new Date()
      }
      
      if (prompt !== undefined) updates.prompt = prompt
      if (modelId !== undefined) updates.modelId = parseInt(modelId)

      const updateResult = await db
        .update(analysisPromptsTable)
        .set(updates)
        .where(eq(analysisPromptsTable.id, existingPrompts[0].id))
        .returning()
      
      updatedPrompt = updateResult[0]

      if (updatedPrompt.modelId) {
        const models = await db
          .select()
          .from(aiModelsTable)
          .where(eq(aiModelsTable.id, updatedPrompt.modelId))
        
        if (models.length > 0) {
          updatedPrompt = { ...updatedPrompt, model: models[0] }
        }
      }
    } else {
      // Create new prompt
      const insertData = {
        prompt: prompt || "",
        isMetaAnalysis,
        audienceId: isMetaAnalysis ? null : audienceId,
        modelId: modelId ? parseInt(modelId) : null
      } as const

      const insertResult = await db
        .insert(analysisPromptsTable)
        .values(insertData)
        .returning()
      
      updatedPrompt = insertResult[0]

      if (updatedPrompt.modelId) {
        const models = await db
          .select()
          .from(aiModelsTable)
          .where(eq(aiModelsTable.id, updatedPrompt.modelId))
        
        if (models.length > 0) {
          updatedPrompt = { ...updatedPrompt, model: models[0] }
        }
      }
    }

    return {
      isSuccess: true,
      message: isMetaAnalysis ? "Meta analysis updated successfully" : "Prompt updated successfully",
      data: updatedPrompt
    }
  } catch (error) {
    return { isSuccess: false, message: "Failed to upsert prompt" }
  }
}

export async function getPromptsAction(params?: {
  isMetaAnalysis?: boolean
  audienceId?: string
}): Promise<ActionState<any[]>> {
  try {
    const { isMetaAnalysis, audienceId } = params || {}

    const baseQuery = db
      .select({
        id: analysisPromptsTable.id,
        audienceId: analysisPromptsTable.audienceId,
        modelId: analysisPromptsTable.modelId,
        prompt: analysisPromptsTable.prompt,
        isMetaAnalysis: analysisPromptsTable.isMetaAnalysis,
        model: aiModelsTable,
        createdAt: analysisPromptsTable.createdAt,
        updatedAt: analysisPromptsTable.updatedAt
      })
      .from(analysisPromptsTable)
      .leftJoin(aiModelsTable, eq(analysisPromptsTable.modelId, aiModelsTable.id))

    let prompts
    if (isMetaAnalysis) {
      prompts = await baseQuery
        .where(eq(analysisPromptsTable.isMetaAnalysis, true))
        .execute()
    } else if (audienceId) {
      prompts = await baseQuery
        .where(eq(analysisPromptsTable.audienceId, audienceId))
        .execute()
    } else {
      prompts = await baseQuery.execute()
    }

    return {
      isSuccess: true,
      message: "Prompts retrieved successfully",
      data: prompts
    }
  } catch (error) {
    return { isSuccess: false, message: "Failed to fetch prompts" }
  }
} 