"use server"

import { db } from "@/db/query"
import {
  promptChainToolsTable,
  toolInputFieldsTable,
  chainPromptsTable,
  toolEditsTable,
  toolExecutionsTable,
  promptResultsTable,
  type InsertPromptChainTool,
  type SelectPromptChainTool,
  type InsertToolInputField,
  type InsertChainPrompt,
  type InsertToolExecution,
  type InsertPromptResult,
  type SelectToolInputField,
  type SelectChainPrompt,
  aiModelsTable,
  toolsTable
} from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and, desc, or, asc } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import { headers } from "next/headers"
import { generateCompletion } from "@/lib/ai-helpers"
import { generateToolIdentifier } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"

// Tool Management Actions

export async function createPromptChainToolAction(
  data: InsertPromptChainTool
): Promise<ActionState<SelectPromptChainTool>> {
  try {
    console.log("Starting createPromptChainToolAction")
    
    const authResult = await auth()
    console.log("Auth result:", authResult)
    
    const { userId } = authResult
    console.log("User ID from auth:", userId)
    
    if (!userId) {
      console.error("No userId found in auth result")
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Set the creator ID and status to "draft"
    const toolData = {
      ...data,
      creatorId: userId,
      status: "draft" as const 
    }
    console.log("Inserting tool with data:", toolData)

    try {
      const [tool] = await db.insert(promptChainToolsTable).values(toolData).returning()
      console.log("Tool created:", tool)

      return {
        isSuccess: true,
        message: "Prompt chain tool created successfully",
        data: tool
      }
    } catch (dbError) {
      console.error("Database error:", dbError)
      return { isSuccess: false, message: "Database error: " + (dbError instanceof Error ? dbError.message : String(dbError)) }
    }
  } catch (error) {
    console.error("Error creating prompt chain tool:", error)
    return { isSuccess: false, message: "Failed to create prompt chain tool: " + (error instanceof Error ? error.message : String(error)) }
  }
}

export async function getPromptChainToolsAction(): Promise<
  ActionState<SelectPromptChainTool[]>
> {
  try {
    console.log("Fetching user's prompt chain tools")
    
    // Get the current user
    const { userId } = await auth()
    console.log("Current user ID:", userId)
    
    if (!userId) {
      return { 
        isSuccess: true, 
        message: "No user logged in", 
        data: [] 
      }
    }
    
    // Build the query - only get tools created by the current user
    const tools = await db
      .select({
        id: promptChainToolsTable.id,
        name: promptChainToolsTable.name,
        description: promptChainToolsTable.description,
        creatorId: promptChainToolsTable.creatorId,
        status: promptChainToolsTable.status,
        isParallel: promptChainToolsTable.isParallel,
        createdAt: promptChainToolsTable.createdAt,
        updatedAt: promptChainToolsTable.updatedAt,
        inputFields: toolInputFieldsTable,
        prompts: chainPromptsTable
      })
      .from(promptChainToolsTable)
      .leftJoin(toolInputFieldsTable, eq(toolInputFieldsTable.toolId, promptChainToolsTable.id))
      .leftJoin(chainPromptsTable, eq(chainPromptsTable.toolId, promptChainToolsTable.id))
      .where(eq(promptChainToolsTable.creatorId, userId));

    console.log("Raw tools data:", tools)

    // Transform the results to include relations
    const transformedTools = tools.reduce((acc, tool) => {
      const existingTool = acc.find(t => t.id === tool.id);
      if (!existingTool) {
        acc.push({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          creatorId: tool.creatorId,
          status: tool.status,
          isParallel: tool.isParallel,
          createdAt: tool.createdAt,
          updatedAt: tool.updatedAt,
          inputFields: tool.inputFields ? [tool.inputFields] : [],
          prompts: tool.prompts ? [tool.prompts] : []
        });
      } else {
        if (tool.inputFields && !existingTool.inputFields.some(f => f.id === tool.inputFields.id)) {
          existingTool.inputFields.push(tool.inputFields);
        }
        if (tool.prompts && !existingTool.prompts.some(p => p.id === tool.prompts.id)) {
          existingTool.prompts.push(tool.prompts);
        }
      }
      return acc;
    }, [] as (SelectPromptChainTool & { inputFields: SelectToolInputField[]; prompts: SelectChainPrompt[] })[]);

    console.log("Transformed tools:", transformedTools)

    return {
      isSuccess: true,
      message: "Tools retrieved successfully",
      data: transformedTools
    }
  } catch (error) {
    console.error("Error getting prompt chain tools:", error)
    return { isSuccess: false, message: "Failed to get tools" }
  }
}

export async function getPromptChainToolAction(
  id: string
): Promise<ActionState<SelectPromptChainTool>> {
  try {
    const tools = await db.select().from(promptChainToolsTable)
      .leftJoin(toolInputFieldsTable, eq(toolInputFieldsTable.toolId, promptChainToolsTable.id))
      .leftJoin(chainPromptsTable, eq(chainPromptsTable.toolId, promptChainToolsTable.id))
      .where(eq(promptChainToolsTable.id, id));

    if (!tools.length) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Transform the results to include relations
    const transformedTool = tools.reduce((acc, tool) => {
      if (!acc) {
        return {
          ...tool.prompt_chain_tools,
          inputFields: tool.tool_input_fields ? [tool.tool_input_fields] : [],
          prompts: tool.chain_prompts ? [tool.chain_prompts] : []
        };
      }
      if (tool.tool_input_fields && !acc.inputFields.some(f => f.id === tool.tool_input_fields.id)) {
        acc.inputFields.push(tool.tool_input_fields);
      }
      if (tool.chain_prompts && !acc.prompts.some(p => p.id === tool.chain_prompts.id)) {
        acc.prompts.push(tool.chain_prompts);
      }
      return acc;
    }, null as (SelectPromptChainTool & { inputFields: SelectToolInputField[]; prompts: SelectChainPrompt[] }) | null);

    if (!transformedTool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    return {
      isSuccess: true,
      message: "Tool retrieved successfully",
      data: transformedTool
    }
  } catch (error) {
    console.error("Error getting prompt chain tool:", error)
    return { isSuccess: false, message: "Failed to get tool" }
  }
}

export async function getPendingPromptChainToolsAction(): Promise<
  ActionState<SelectPromptChainTool[]>
> {
  try {
    // First, get the base tools
    const pendingTools = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.status, "pending_approval"));

    // Then, for each tool, get its input fields and prompts
    const toolsWithRelations = await Promise.all(
      pendingTools.map(async (tool) => {
        const inputFields = await db
          .select()
          .from(toolInputFieldsTable)
          .where(eq(toolInputFieldsTable.toolId, tool.id))
          .orderBy(asc(toolInputFieldsTable.position));

        const prompts = await db
          .select()
          .from(chainPromptsTable)
          .where(eq(chainPromptsTable.toolId, tool.id))
          .orderBy(asc(chainPromptsTable.position));

        return {
          ...tool,
          inputFields,
          prompts
        };
      })
    );

    return {
      isSuccess: true,
      message: "Pending tools retrieved successfully",
      data: toolsWithRelations
    };
  } catch (error) {
    console.error("Error getting pending prompt chain tools:", error);
    return { isSuccess: false, message: "Failed to get pending tools" };
  }
}

export async function updatePromptChainToolAction(
  id: string,
  data: Partial<InsertPromptChainTool>
): Promise<ActionState<SelectPromptChainTool>> {
  try {
    // Start a transaction since we might need to update both systems
    return await db.transaction(async (tx) => {
      // Update the prompt chain tool
      const [updatedTool] = await tx
        .update(promptChainToolsTable)
        .set(data)
        .where(eq(promptChainToolsTable.id, id))
        .returning()

      if (!updatedTool) {
        throw new Error("Tool not found")
      }

      // If the tool is approved, sync changes to the base tools system
      if (updatedTool.status === "approved") {
        const existingTool = await tx
          .query.tools.findFirst({
            where: eq(toolsTable.promptChainToolId, id)
          })

        if (existingTool) {
          await tx
            .update(toolsTable)
            .set({
              name: updatedTool.name,
              description: updatedTool.description || undefined
            })
            .where(eq(toolsTable.promptChainToolId, id))
        }
      }

      return {
        isSuccess: true,
        message: "Tool updated successfully",
        data: updatedTool
      }
    })
  } catch (error) {
    console.error("Error updating tool:", error)
    return { isSuccess: false, message: "Failed to update tool" }
  }
}

export async function deletePromptChainToolAction(
  id: string
): Promise<ActionState<void>> {
  try {
    // Start a transaction since we're deleting from multiple tables
    await db.transaction(async (tx) => {
      // The tool in the base system will be automatically deleted due to ON DELETE CASCADE
      await tx.delete(promptChainToolsTable).where(eq(promptChainToolsTable.id, id))
    })

    return {
      isSuccess: true,
      message: "Tool deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting tool:", error)
    return { isSuccess: false, message: "Failed to delete tool" }
  }
}

// Input Field Management Actions

export async function addInputFieldAction(
  data: InsertToolInputField
): Promise<ActionState<SelectToolInputField>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, data.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can add fields
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    const [field] = await db.insert(toolInputFieldsTable).values(data).returning()

    return {
      isSuccess: true,
      message: "Input field added successfully",
      data: field
    }
  } catch (error) {
    console.error("Error adding input field:", error)
    return { isSuccess: false, message: "Failed to add input field" }
  }
}

export async function deleteInputFieldAction(
  fieldId: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the field to find its tool
    const [field] = await db
      .select({
        id: toolInputFieldsTable.id,
        toolId: toolInputFieldsTable.toolId
      })
      .from(toolInputFieldsTable)
      .where(eq(toolInputFieldsTable.id, fieldId))

    if (!field) {
      return { isSuccess: false, message: "Input field not found" }
    }

    // Check if user is the creator of the tool
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, field.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Check permissions
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if tool is in a state that allows editing
    if (tool.status !== "draft" && tool.status !== "rejected" && !isAdmin) {
      return { 
        isSuccess: false, 
        message: "Cannot delete fields for tools that are not in draft or rejected status" 
      }
    }

    // Delete the field
    await db
      .delete(toolInputFieldsTable)
      .where(eq(toolInputFieldsTable.id, fieldId))

    return {
      isSuccess: true,
      message: "Input field deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting input field:", error)
    return { isSuccess: false, message: "Failed to delete input field" }
  }
}

export async function updateInputFieldAction(
  id: string,
  data: Partial<InsertToolInputField>
): Promise<ActionState<SelectToolInputField>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the field
    const [field] = await db
      .select()
      .from(toolInputFieldsTable)
      .where(eq(toolInputFieldsTable.id, id))

    if (!field) {
      return { isSuccess: false, message: "Input field not found" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, field.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can update fields
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if tool is in a state that allows editing
    if (tool.status !== "draft" && tool.status !== "rejected" && !isAdmin) {
      return { 
        isSuccess: false, 
        message: "Cannot update fields for tools that are not in draft or rejected status" 
      }
    }

    // Update the field
    const [updatedField] = await db
      .update(toolInputFieldsTable)
      .set(data)
      .where(eq(toolInputFieldsTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Input field updated successfully",
      data: updatedField
    }
  } catch (error) {
    console.error("Error updating input field:", error)
    return { isSuccess: false, message: "Failed to update input field" }
  }
}

export async function reorderInputFieldsAction(
  toolId: string,
  fieldOrders: { id: string; position: number }[]
): Promise<ActionState<SelectToolInputField[]>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can reorder fields
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if tool is in a state that allows editing
    if (tool.status !== "draft" && tool.status !== "rejected" && !isAdmin) {
      return { 
        isSuccess: false, 
        message: "Cannot reorder fields for tools that are not in draft or rejected status" 
      }
    }

    // Update each field's position
    const updatedFields = await Promise.all(
      fieldOrders.map(({ id, position }) =>
        db
          .update(toolInputFieldsTable)
          .set({ position })
          .where(eq(toolInputFieldsTable.id, id))
          .returning()
      )
    )

    return {
      isSuccess: true,
      message: "Input fields reordered successfully",
      data: updatedFields.map(([field]) => field)
    }
  } catch (error) {
    console.error("Error reordering input fields:", error)
    return { isSuccess: false, message: "Failed to reorder input fields" }
  }
}

// Chain Prompt Management Actions

export async function addPromptAction(
  data: InsertChainPrompt
): Promise<ActionState<SelectChainPrompt>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, data.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can add prompts
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    const [prompt] = await db.insert(chainPromptsTable).values(data).returning()

    return {
      isSuccess: true,
      message: "Prompt added successfully",
      data: prompt
    }
  } catch (error) {
    console.error("Error adding prompt:", error)
    return { isSuccess: false, message: "Failed to add prompt" }
  }
}

export async function updatePromptAction(
  id: string,
  data: Partial<InsertChainPrompt>
): Promise<ActionState<SelectChainPrompt>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the prompt
    const [prompt] = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.id, id))

    if (!prompt) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, prompt.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can update prompts
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update the prompt
    const [updatedPrompt] = await db
      .update(chainPromptsTable)
      .set(data)
      .where(eq(chainPromptsTable.id, id))
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

export async function deletePromptAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the prompt
    const [prompt] = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.id, id))

    if (!prompt) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, prompt.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can delete prompts
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the prompt
    await db
      .delete(chainPromptsTable)
      .where(eq(chainPromptsTable.id, id))

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

export async function updatePromptPositionAction(
  id: string,
  direction: "up" | "down"
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the prompt
    const [prompt] = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.id, id))

    if (!prompt) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, prompt.toolId))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Only tool creator or admin can update prompt positions
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Get all prompts for this tool, ordered by position
    const prompts = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.toolId, prompt.toolId))
      .orderBy(asc(chainPromptsTable.position))

    // Find current index
    const currentIndex = prompts.findIndex(p => p.id === id)
    if (currentIndex === -1) {
      return { isSuccess: false, message: "Prompt not found in sequence" }
    }

    // Calculate target index
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    
    // Validate target index
    if (targetIndex < 0 || targetIndex >= prompts.length) {
      return { isSuccess: false, message: "Cannot move prompt further" }
    }

    // Swap positions
    const targetPrompt = prompts[targetIndex]
    
    // Update both prompts with their new positions
    await db.transaction(async (tx) => {
      await tx
        .update(chainPromptsTable)
        .set({ position: targetPrompt.position })
        .where(eq(chainPromptsTable.id, prompt.id))
      
      await tx
        .update(chainPromptsTable)
        .set({ position: prompt.position })
        .where(eq(chainPromptsTable.id, targetPrompt.id))
    })

    return {
      isSuccess: true,
      message: "Prompt position updated successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error updating prompt position:", error)
    return { isSuccess: false, message: "Failed to update prompt position" }
  }
}

// Tool Execution Actions

export async function createToolExecutionAction(
  execution: InsertToolExecution
): Promise<ActionState<string>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    execution.userId = userId

    const [newExecution] = await db
      .insert(toolExecutionsTable)
      .values(execution)
      .returning()

    return {
      isSuccess: true,
      message: "Tool execution created successfully",
      data: newExecution.id
    }
  } catch (error) {
    console.error("Error creating tool execution:", error)
    return { isSuccess: false, message: "Failed to create tool execution" }
  }
}

export async function updatePromptResultAction(
  executionId: string,
  promptId: string,
  result: Partial<InsertPromptResult>
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    await db
      .update(promptResultsTable)
      .set(result)
      .where(
        and(
          eq(promptResultsTable.executionId, executionId),
          eq(promptResultsTable.promptId, promptId)
        )
      )

    return {
      isSuccess: true,
      message: "Prompt result updated successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error updating prompt result:", error)
    return { isSuccess: false, message: "Failed to update prompt result" }
  }
}

// Tool Approval Actions

export async function approvePromptChainToolAction(
  toolId: string
): Promise<ActionState<SelectPromptChainTool>> {
  try {
    // Start a transaction since we're updating multiple tables
    return await db.transaction(async (tx) => {
      // Update the prompt chain tool status
      const [updatedTool] = await tx
        .update(promptChainToolsTable)
        .set({ status: "approved" })
        .where(eq(promptChainToolsTable.id, toolId))
        .returning()

      if (!updatedTool) {
        throw new Error("Tool not found")
      }

      // Check if a tool already exists for this prompt chain
      const [existingTool] = await tx
        .select()
        .from(toolsTable)
        .where(eq(toolsTable.promptChainToolId, toolId))

      // Generate a unique identifier
      let identifier = generateToolIdentifier(updatedTool.name)
      if (!existingTool) {
        // Make sure the identifier is unique by appending a UUID if needed
        const [duplicateIdentifier] = await tx
          .select()
          .from(toolsTable)
          .where(eq(toolsTable.identifier, identifier))

        if (duplicateIdentifier) {
          identifier = `${identifier}-${uuidv4().slice(0, 8)}`
        }
      }

      // Create or update the tool in the base tools system
      const toolData: Partial<InsertTool> = {
        name: updatedTool.name,
        description: updatedTool.description || undefined,
        identifier,
        promptChainToolId: toolId
      }

      if (existingTool) {
        await tx
          .update(toolsTable)
          .set(toolData)
          .where(eq(toolsTable.promptChainToolId, toolId))
      } else {
        await tx.insert(toolsTable).values({
          ...toolData,
          id: identifier,
          isActive: true
        })
      }

      return {
        isSuccess: true,
        message: "Tool approved successfully",
        data: updatedTool
      }
    })
  } catch (error) {
    console.error("Error approving tool:", error)
    return { isSuccess: false, message: "Failed to approve tool" }
  }
}

export async function rejectPromptChainToolAction(
  id: string,
  rejectionReason?: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    await db
      .update(promptChainToolsTable)
      .set({ 
        status: "rejected"
      })
      .where(eq(promptChainToolsTable.id, id))

    return {
      isSuccess: true,
      message: "Tool rejected successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error rejecting prompt chain tool:", error)
    return { isSuccess: false, message: "Failed to reject tool" }
  }
}

export async function executePromptChainAction({
  toolId,
  inputs
}: {
  toolId: string
  inputs: Record<string, string | string[]>
}): Promise<ActionState<any>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    console.log("Executing prompt chain action with inputs:", inputs)
    
    // Get the tool with its prompts and input fields
    const toolResult = await getPromptChainToolAction(toolId)
    if (!toolResult.isSuccess) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult.data

    // Create an execution record
    const [execution] = await db.insert(toolExecutionsTable).values({
      toolId,
      userId,
      inputData: inputs,
      status: "running"
    }).returning()

    // Process prompts in order
    const results = []
    const prompts = tool.prompts?.sort((a, b) => a.position - b.position) || []

    for (const prompt of prompts) {
      try {
        // Create a prompt result record
        const [promptResult] = await db.insert(promptResultsTable).values({
          executionId: execution.id,
          promptId: prompt.id,
          inputData: inputs,
          status: "running"
        }).returning()

        const startTime = new Date()

        // Get the model configuration
        const [model] = await db
          .select()
          .from(aiModelsTable)
          .where(eq(aiModelsTable.id, prompt.modelId))

        if (!model) {
          throw new Error(`No model configured for prompt ${prompt.id}`)
        }

        // Prepare input data by resolving mappings
        const inputData = { ...inputs }
        if (prompt.inputMapping) {
          for (const [key, value] of Object.entries(prompt.inputMapping)) {
            if (value.startsWith('input.')) {
              // Input field mapping
              const fieldId = value.replace('input.', '')
              inputData[key] = inputs[fieldId]
            } else {
              // Previous prompt mapping
              const previousResult = results.find(r => r.promptId === value)
              if (previousResult) {
                inputData[key] = previousResult.output
              }
            }
          }
        }

        // Execute the prompt
        const output = await generateCompletion(
          {
            provider: model.provider,
            modelId: model.modelId
          },
          prompt.systemContext,
          // Ensure content is not empty after variable substitution
          prompt.content.replace(/\${(\w+)}/g, (_, key) => {
            const value = inputData[key]
            return value !== undefined ? String(value) : `[Missing value for ${key}]`
          }).trim() || "Please provide input for this prompt."
        )

        const endTime = new Date()
        const executionTimeMs = endTime.getTime() - startTime.getTime()

        // Update the prompt result
        await db.update(promptResultsTable)
          .set({
            outputData: output,
            status: "completed",
            completedAt: endTime,
            executionTimeMs
          })
          .where(eq(promptResultsTable.id, promptResult.id))

        results.push({
          promptId: prompt.id,
          status: "completed" as const,
          input: inputData,
          output,
          startTime,
          endTime,
          executionTimeMs
        })
      } catch (error) {
        console.error(`Error executing prompt ${prompt.id}:`, error)
        
        // Update the prompt result with error
        await db.update(promptResultsTable)
          .set({
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date()
          })
          .where(eq(promptResultsTable.id, prompt.id))

        results.push({
          promptId: prompt.id,
          status: "failed" as const,
          input: inputs,
          error: error instanceof Error ? error.message : "Unknown error",
          startTime: new Date(),
          endTime: new Date()
        })
      }
    }

    // Update the execution record
    const completedAt = new Date()
    await db.update(toolExecutionsTable)
      .set({
        status: results.some(r => r.status === "failed") ? "failed" : "completed",
        completedAt
      })
      .where(eq(toolExecutionsTable.id, execution.id))

    return {
      isSuccess: true,
      message: "Tool executed successfully",
      data: {
        id: execution.id,
        status: results.some(r => r.status === "failed") ? "failed" : "completed",
        results,
        startTime: execution.startedAt,
        endTime: completedAt
      }
    }
  } catch (error) {
    console.error("Error executing prompt chain:", error)
    return { isSuccess: false, message: "Failed to execute tool" }
  }
}

// For the public view, get only approved tools
export async function getApprovedPromptChainToolsAction(): Promise<
  ActionState<SelectPromptChainTool[]>
> {
  try {
    console.log("Fetching approved prompt chain tools")
    
    // Build the query - only get approved tools
    const tools = await db
      .select({
        id: promptChainToolsTable.id,
        name: promptChainToolsTable.name,
        description: promptChainToolsTable.description,
        creatorId: promptChainToolsTable.creatorId,
        status: promptChainToolsTable.status,
        isParallel: promptChainToolsTable.isParallel,
        createdAt: promptChainToolsTable.createdAt,
        updatedAt: promptChainToolsTable.updatedAt,
        inputFields: toolInputFieldsTable,
        prompts: chainPromptsTable
      })
      .from(promptChainToolsTable)
      .leftJoin(toolInputFieldsTable, eq(toolInputFieldsTable.toolId, promptChainToolsTable.id))
      .leftJoin(chainPromptsTable, eq(chainPromptsTable.toolId, promptChainToolsTable.id))
      .where(eq(promptChainToolsTable.status, "approved"));

    // Transform the results to include relations
    const transformedTools = tools.reduce((acc, tool) => {
      const existingTool = acc.find(t => t.id === tool.id);
      if (!existingTool) {
        acc.push({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          creatorId: tool.creatorId,
          status: tool.status,
          isParallel: tool.isParallel,
          createdAt: tool.createdAt,
          updatedAt: tool.updatedAt,
          inputFields: tool.inputFields ? [tool.inputFields] : [],
          prompts: tool.prompts ? [tool.prompts] : []
        });
      } else {
        if (tool.inputFields && !existingTool.inputFields.some(f => f.id === tool.inputFields.id)) {
          existingTool.inputFields.push(tool.inputFields);
        }
        if (tool.prompts && !existingTool.prompts.some(p => p.id === tool.prompts.id)) {
          existingTool.prompts.push(tool.prompts);
        }
      }
      return acc;
    }, [] as (SelectPromptChainTool & { inputFields: SelectToolInputField[]; prompts: SelectChainPrompt[] })[]);

    return {
      isSuccess: true,
      message: "Approved tools retrieved successfully",
      data: transformedTools
    }
  } catch (error) {
    console.error("Error getting approved prompt chain tools:", error)
    return { isSuccess: false, message: "Failed to get approved tools" }
  }
}

export async function submitPromptChainToolForApprovalAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if the user is the creator of the tool
    const [tool] = await db
      .select()
      .from(promptChainToolsTable)
      .where(eq(promptChainToolsTable.id, id))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    if (tool.creatorId !== userId) {
      return { isSuccess: false, message: "Only the creator can submit a tool for approval" }
    }

    // Update the status to pending_approval
    await db
      .update(promptChainToolsTable)
      .set({ status: "pending_approval" })
      .where(eq(promptChainToolsTable.id, id))

    return {
      isSuccess: true,
      message: "Tool submitted for approval",
      data: undefined
    }
  } catch (error) {
    console.error("Error submitting tool for approval:", error)
    return { isSuccess: false, message: "Failed to submit tool for approval" }
  }
} 