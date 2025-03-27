"use server"

import { db } from "@/db/query"
import { 
  metaPromptingTechniquesTable, 
  metaPromptingTemplatesTable,
  type InsertMetaPromptingTechnique,
  type SelectMetaPromptingTechnique,
  type InsertMetaPromptingTemplate,
  type SelectMetaPromptingTemplate
} from "@/db/schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"

// Technique Actions
export async function createTechniqueAction(
  technique: InsertMetaPromptingTechnique
): Promise<ActionState<SelectMetaPromptingTechnique>> {
  try {
    const [newTechnique] = await db
      .insert(metaPromptingTechniquesTable)
      .values(technique)
      .returning()

    return {
      isSuccess: true,
      message: "Technique created successfully",
      data: newTechnique
    }
  } catch (error) {
    console.error("Error creating technique:", error)
    return { isSuccess: false, message: "Failed to create technique" }
  }
}

export async function getTechniquesAction(): Promise<ActionState<SelectMetaPromptingTechnique[]>> {
  try {
    const techniques = await db.select().from(metaPromptingTechniquesTable)
    return {
      isSuccess: true,
      message: "Techniques retrieved successfully",
      data: techniques
    }
  } catch (error) {
    console.error("Error getting techniques:", error)
    return { isSuccess: false, message: "Failed to get techniques" }
  }
}

export async function updateTechniqueAction(
  id: string,
  updates: Partial<InsertMetaPromptingTechnique>
): Promise<ActionState<SelectMetaPromptingTechnique>> {
  try {
    const [updatedTechnique] = await db
      .update(metaPromptingTechniquesTable)
      .set(updates)
      .where(eq(metaPromptingTechniquesTable.id, id))
      .returning()

    if (!updatedTechnique) {
      return { isSuccess: false, message: "Technique not found" }
    }

    return {
      isSuccess: true,
      message: "Technique updated successfully",
      data: updatedTechnique
    }
  } catch (error) {
    console.error("Error updating technique:", error)
    return { isSuccess: false, message: "Failed to update technique" }
  }
}

export async function deleteTechniqueAction(
  id: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(metaPromptingTechniquesTable)
      .where(eq(metaPromptingTechniquesTable.id, id))

    return {
      isSuccess: true,
      message: "Technique deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting technique:", error)
    return { isSuccess: false, message: "Failed to delete technique" }
  }
}

// Template Actions
export async function createTemplateAction(
  template: InsertMetaPromptingTemplate
): Promise<ActionState<SelectMetaPromptingTemplate>> {
  try {
    const [newTemplate] = await db
      .insert(metaPromptingTemplatesTable)
      .values(template)
      .returning()

    return {
      isSuccess: true,
      message: "Template created successfully",
      data: newTemplate
    }
  } catch (error) {
    console.error("Error creating template:", error)
    return { isSuccess: false, message: "Failed to create template" }
  }
}

export async function getTemplatesAction(): Promise<ActionState<SelectMetaPromptingTemplate[]>> {
  try {
    const templates = await db.select().from(metaPromptingTemplatesTable)
    return {
      isSuccess: true,
      message: "Templates retrieved successfully",
      data: templates
    }
  } catch (error) {
    console.error("Error getting templates:", error)
    return { isSuccess: false, message: "Failed to get templates" }
  }
}

export async function updateTemplateAction(
  id: string,
  updates: Partial<InsertMetaPromptingTemplate>
): Promise<ActionState<SelectMetaPromptingTemplate>> {
  try {
    const [updatedTemplate] = await db
      .update(metaPromptingTemplatesTable)
      .set(updates)
      .where(eq(metaPromptingTemplatesTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Template updated successfully",
      data: updatedTemplate
    }
  } catch (error) {
    console.error("Error updating template:", error)
    return { isSuccess: false, message: "Failed to update template" }
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionState<void>> {
  try {
    await db
      .delete(metaPromptingTemplatesTable)
      .where(eq(metaPromptingTemplatesTable.id, id))

    return {
      isSuccess: true,
      message: "Template deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting template:", error)
    return { isSuccess: false, message: "Failed to delete template" }
  }
} 