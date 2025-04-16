"use server"

import { db } from "@/db/query"
import {
  assistantArchitectsTable,
  toolInputFieldsTable,
  chainPromptsTable,
  toolEditsTable,
  toolExecutionsTable,
  promptResultsTable,
  type InsertAssistantArchitect,
  type SelectAssistantArchitect,
  type InsertToolInputField,
  type InsertChainPrompt,
  type InsertToolExecution,
  type InsertPromptResult,
  type SelectToolInputField,
  type SelectChainPrompt,
  aiModelsTable,
  toolsTable,
  executionStatusEnum,
  type InsertTool,
  type SelectTool,
  type SelectToolExecution,
  type SelectPromptResult,
  promptResultStatusEnum,
  rolesTable,
  roleToolsTable
} from "@/db/schema"
import { ActionState, AssistantArchitectWithRelations } from "@/types"
import { eq, and, desc, or, asc, inArray } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole, hasToolAccess, getUserTools } from "@/utils/roles"
import { headers } from "next/headers"
import { generateCompletion } from "@/lib/ai-helpers"
import { generateToolIdentifier } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"

// Tool Management Actions

export async function createAssistantArchitectAction(
  data: InsertAssistantArchitect
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    console.log("Starting createAssistantArchitectAction")
    
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
      const [tool] = await db.insert(assistantArchitectsTable).values(toolData).returning()
      console.log("Tool created:", tool)

      return {
        isSuccess: true,
        message: "Assistant Architect created successfully",
        data: tool
      }
    } catch (dbError) {
      console.error("Database error:", dbError)
      return { isSuccess: false, message: "Database error: " + (dbError instanceof Error ? dbError.message : String(dbError)) }
    }
  } catch (error) {
    console.error("Error creating Assistant Architect:", error)
    return { isSuccess: false, message: "Failed to create Assistant Architect" }
  }
}

export async function getAssistantArchitectsAction(): Promise<
  ActionState<AssistantArchitectWithRelations[]>
> {
  try {
    const { userId } = await auth();
    if (!userId) return { isSuccess: false, message: "Unauthorized" };

    // Get tools created by this user
    const userArchitects = await db.query.assistantArchitects.findMany({
      where: eq(assistantArchitectsTable.creatorId, userId),
    });

    // Get all approved tools
    const approvedArchitects = await db.query.assistantArchitects.findMany({
      where: eq(assistantArchitectsTable.status, "approved"),
    });
    
    // Combine user-created and approved tools (without duplicates)
    const userArchitectIds = new Set(userArchitects.map(a => a.id));
    
    // Only add approved tools that aren't already in user tools
    const uniqueApprovedArchitects = approvedArchitects.filter(
      a => !userArchitectIds.has(a.id)
    );
    
    const combinedArchitects = [...userArchitects, ...uniqueApprovedArchitects];
    const architectIds = combinedArchitects.map(a => a.id);
    
    if (architectIds.length === 0) {
        return { isSuccess: true, message: "No architects found", data: [] };
    }
    
    const allInputFields = await db.query.toolInputFields.findMany({
        where: inArray(toolInputFieldsTable.toolId, architectIds),
        orderBy: [asc(toolInputFieldsTable.position)]
    });

    const allPrompts = await db.query.chainPrompts.findMany({
        where: inArray(chainPromptsTable.toolId, architectIds),
        orderBy: [asc(chainPromptsTable.position)]
    });

    const results = combinedArchitects.map(architect => ({
      ...architect,
      inputFields: allInputFields.filter(f => f.toolId === architect.id) ?? [],
      prompts: allPrompts.filter(p => p.toolId === architect.id) ?? []
    }));

    return {
      isSuccess: true,
      message: "Assistant Architects retrieved successfully",
      data: results
    };

  } catch (error) {
    console.error("Error getting Assistant Architects:", error);
    return { isSuccess: false, message: "Failed to get Assistant Architects" };
  }
}

export async function getAssistantArchitectAction(
  id: string
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const architect = await db.query.assistantArchitects.findFirst({
      where: eq(assistantArchitectsTable.id, id)
    });
    if (!architect) return { isSuccess: false, message: "Assistant Architect not found" };

    // Check if user has access - only creator or approved tools
    const isCreator = architect.creatorId === userId;
    const isApproved = architect.status === "approved";
    
    // Check if user has access
    if (!isCreator && !isApproved) {
      // If not creator and not approved, check if admin
      const isAdmin = await hasRole(userId, "administrator");
      if (!isAdmin) {
        return { isSuccess: false, message: "You don't have permission to access this tool" };
      }
    }

    const inputFields = await db.query.toolInputFields.findMany({
        columns: {
          id: true,
          toolId: true,
          name: true,
          fieldType: true,
          options: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
        where: eq(toolInputFieldsTable.toolId, id),
        orderBy: [asc(toolInputFieldsTable.position)]
    });

    const prompts = await db.query.chainPrompts.findMany({
        columns: {
            id: true,
            toolId: true,
            name: true,
            content: true,
            systemContext: true,
            modelId: true,
            position: true,
            inputMapping: true,
            createdAt: true,
            updatedAt: true,
        },
        where: eq(chainPromptsTable.toolId, id),
        orderBy: [asc(chainPromptsTable.position)]
    });

    const resultData = { ...architect, inputFields: inputFields || [], prompts: prompts || [] };
    return {
      isSuccess: true,
      message: "Assistant Architect retrieved successfully",
      data: resultData as AssistantArchitectWithRelations
    };
  } catch (error) {
    console.error(`[getAssistantArchitectAction] Error fetching Assistant Architect ${id}:`, error);
    const message = error instanceof Error ? error.message : "Failed to get Assistant Architect";
    return { isSuccess: false, message };
  }
}

export async function getPendingAssistantArchitectsAction(): Promise<
  ActionState<SelectAssistantArchitect[]>
> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view pending tools" }
    }

    // First, get the base tools
    const pendingTools = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.status, "pending_approval"));

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
      message: "Pending Assistant Architects retrieved successfully",
      data: toolsWithRelations
    };
  } catch (error) {
    console.error("Error getting pending Assistant Architects:", error);
    return { isSuccess: false, message: "Failed to get pending Assistant Architects" };
  }
}

export async function updateAssistantArchitectAction(
  id: string,
  data: Partial<InsertAssistantArchitect>
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    // Start a transaction since we might need to update both systems
    return await db.transaction(async (tx) => {
      // Update the Assistant Architect
      const [updatedTool] = await tx
        .update(assistantArchitectsTable)
        .set(data)
        .where(eq(assistantArchitectsTable.id, id))
        .returning()

      if (!updatedTool) {
        throw new Error("Tool not found")
      }

      // If the tool is approved, sync changes to the base tools system
      if (updatedTool.status === "approved") {
        const existingTool = await tx
          .query.tools.findFirst({
            where: eq(toolsTable.assistantArchitectId, id)
          })

        if (existingTool) {
          await tx
            .update(toolsTable)
            .set({
              name: updatedTool.name,
              description: updatedTool.description || undefined
            })
            .where(eq(toolsTable.assistantArchitectId, id))
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

export async function deleteAssistantArchitectAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the tool to check permissions
    const [tool] = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, id))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    // Check if user is the creator or an administrator
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Only the creator or administrator can delete this tool" }
    }

    // Start a transaction since we're deleting from multiple tables
    await db.transaction(async (tx) => {
      // Check if this tool has a corresponding entry in the tools table
      const [baseTool] = await tx
        .select()
        .from(toolsTable)
        .where(eq(toolsTable.assistantArchitectId, id))
      
      if (baseTool) {
        // Delete any role-tool assignments
        await tx
          .delete(roleToolsTable)
          .where(eq(roleToolsTable.toolId, baseTool.id))
      }

      // The tool in the base system will be automatically deleted due to ON DELETE CASCADE
      await tx.delete(assistantArchitectsTable).where(eq(assistantArchitectsTable.id, id))
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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, data.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, field.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, field.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, data.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, prompt.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, prompt.toolId))

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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, prompt.toolId))

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

export async function approveAssistantArchitectAction(
  toolId: string
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can approve tools" }
    }

    return await db.transaction(async (tx) => {
      const [updatedTool] = await tx.update(assistantArchitectsTable).set({ status: "approved" }).where(eq(assistantArchitectsTable.id, toolId)).returning();
      if (!updatedTool) throw new Error("Tool not found");
      const [existingTool] = await tx.select().from(toolsTable).where(eq(toolsTable.assistantArchitectId, toolId));

      let identifier = generateToolIdentifier(updatedTool.name);
      if (!existingTool) {
           const [duplicateIdentifier] = await tx.select({ id: toolsTable.id }).from(toolsTable).where(eq(toolsTable.identifier, identifier));
           if (duplicateIdentifier) identifier = `${identifier}-${uuidv4().slice(0, 8)}`;
      }
      
      // Data for updating/inserting into toolsTable
      const commonToolData = {
          identifier: identifier, 
          name: updatedTool.name,
          description: updatedTool.description,
          isActive: true,
          assistantArchitectId: toolId,
      };

      let toolId: string;

      if (existingTool) {
        await tx.update(toolsTable).set(commonToolData).where(eq(toolsTable.id, existingTool.id));
        toolId = existingTool.id;
      } else {
        // Ensure 'id' (PK) is provided for insert
        await tx.insert(toolsTable).values({ ...commonToolData, id: identifier });
        toolId = identifier;
      }
      
      // Get all roles that should have access to this tool
      // For now, we'll give access to staff and administrator roles by default
      // This could be extended later to allow specifying roles during approval
      
      // First, find the role IDs for staff and administrator
      const roles = await tx
        .select()
        .from(rolesTable)
        .where(inArray(rolesTable.name, ["staff", "administrator"]));
      
      if (roles.length > 0) {
        // Assign the tool to each role
        const roleToolEntries = roles.map(role => ({
          roleId: role.id,
          toolId: toolId
        }));
        
        // Insert role-tool assignments
        await tx.insert(roleToolsTable).values(roleToolEntries);
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

export async function rejectAssistantArchitectAction(
  id: string,
  rejectionReason?: string
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can reject tools" }
    }

    await db
      .update(assistantArchitectsTable)
      .set({ 
        status: "rejected"
      })
      .where(eq(assistantArchitectsTable.id, id))

    return {
      isSuccess: true,
      message: "Tool rejected successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error rejecting Assistant Architect:", error)
    return { isSuccess: false, message: "Failed to reject tool" }
  }
}

// Define a type for the prompt execution result structure
interface PromptExecutionResult {
  promptId: string;
  status: "completed" | "failed";
  input: Record<string, any>; // Input data specific to this prompt
  output?: string; // Output from AI
  error?: string; // Error message if failed
  startTime: Date;
  endTime: Date;
  durationMs?: number;
}

export async function executeAssistantArchitectAction({ 
  toolId, 
  inputs 
}: {
  toolId: string
  inputs: Record<string, any>
}): Promise<ActionState<any>> { 
  const executionStartTime = new Date();
  console.log(`[EXEC] Started for tool ${toolId}`);
  
  let executionIdFromTx: string | null = null;
  let finalStatusFromTx: SelectToolExecution['status'] | null = null;
  let resultsFromTx: PromptExecutionResult[] = [];

  try {
    // Start transaction
    await db.transaction(async (tx) => {
      let execution: SelectToolExecution | null = null;
      
      const { userId } = await auth()
      if (!userId) throw new Error("Unauthorized");

      // First get the tool to check if it's approved
      const toolResult = await getAssistantArchitectAction(toolId)
      if (!toolResult.isSuccess || !toolResult.data) throw new Error("Tool not found"); 
      const tool = toolResult.data as AssistantArchitectWithRelations;
      
      // Check if the tool is approved - only approved tools can be executed
      if (tool.status !== "approved") {
        throw new Error("Cannot execute a tool that is not approved");
      }

      const [insertedExecution] = await tx.insert(toolExecutionsTable).values({
        toolId, userId, inputData: inputs,
        status: executionStatusEnum.enumValues[1], // 'running'
        startedAt: executionStartTime
      }).returning()
      execution = insertedExecution;
      console.log(`[EXEC] Created execution ${execution.id}`);

      const results: PromptExecutionResult[] = [] 
      const prompts = tool.prompts?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) || [];

      for (const [index, prompt] of prompts.entries()) {
        let promptResultRecord: SelectPromptResult | null = null;
        const promptStartTime = new Date();
        const promptInputData = { ...inputs }; 
        console.log(`[EXEC:${execution.id}] Processing prompt ${index+1}/${prompts.length}: ${prompt.name}`);

        try {
          const [insertedPromptResult] = await tx.insert(promptResultsTable).values({
            executionId: execution.id,
            promptId: prompt.id,
            inputData: promptInputData,
            status: promptResultStatusEnum.enumValues[1], // 'running'
            startedAt: promptStartTime
          }).returning();
          promptResultRecord = insertedPromptResult;

          const model = prompt.modelId ? await db.query.aiModels.findFirst({ where: eq(aiModelsTable.id, prompt.modelId) }) : null;
          if (!model) throw new Error(`No model configured or found for prompt ${prompt.id}`);

          if (prompt.inputMapping) {
            for (const [key, value] of Object.entries(prompt.inputMapping as Record<string, string>)) {
              if (value.startsWith('input.')) {
                const fieldName = value.replace('input.', '');
                const inputFieldDef = tool.inputFields?.find((f: SelectToolInputField) => f.name === fieldName);
                promptInputData[key] = inputFieldDef ? inputs[fieldName] : `[Mapping error: Input field '${fieldName}' not found]`;
              } else { 
                const previousResult = results.find((r: PromptExecutionResult) => r.promptId === value);
                promptInputData[key] = previousResult?.output ?? `[Mapping error: Result from prompt '${value}' not found]`; 
              }
            }
          }

          const replaceVars = (template: string | null): string => template?.replace(/\${(.*?)}/g, (_: string, key: string): string => {
              const value = promptInputData[key.trim()];
              return value !== undefined ? String(value) : `[Missing value: ${key.trim()}]`;
          }) || "";
          const finalContent = replaceVars(prompt.content);
          const finalSystemContext = replaceVars(prompt.systemContext);

          const output = await generateCompletion({ provider: model.provider, modelId: model.modelId }, finalSystemContext, finalContent || "(Empty Content)");

          const endTime = new Date()
          const executionTimeMs = endTime.getTime() - promptStartTime.getTime()

          await tx.update(promptResultsTable).set({
              outputData: output,
              status: promptResultStatusEnum.enumValues[1], // 'completed'
              completedAt: endTime,
              executionTimeMs: executionTimeMs
            }).where(eq(promptResultsTable.id, promptResultRecord.id))

           results.push({ promptId: prompt.id, status: "completed", input: promptInputData, output: output, startTime: promptStartTime, endTime, durationMs: executionTimeMs });
           console.log(`[EXEC:${execution.id}] Completed prompt ${index+1}/${prompts.length}: ${prompt.name}`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.error(`[EXEC:${execution.id}] Error processing prompt ${index+1}: ${errorMsg}`);
            
            if (promptResultRecord) {
               try {
                   await tx.update(promptResultsTable).set({
                      status: promptResultStatusEnum.enumValues[2], // 'failed'
                      errorMessage: errorMsg, 
                      completedAt: new Date()
                    }).where(eq(promptResultsTable.id, promptResultRecord.id))
               } catch (dbError) {
                   console.error(`[EXEC:${execution.id}] Failed to update prompt result: ${dbError}`);
               }
            }
            results.push({ promptId: prompt.id, status: "failed", input: promptInputData, error: errorMsg, startTime: promptStartTime, endTime: new Date() });
            console.log(`[EXEC:${execution.id}] Failed prompt ${index+1}/${prompts.length}: ${prompt.name}`);
            
            if (!tool.isParallel) { 
                 console.log(`[EXEC:${execution.id}] Stopping sequential execution due to failure`);
                 throw new Error(`Execution failed on prompt ${prompt.id}: ${errorMsg}`); 
            }
        }
      } // End for loop
      
      // Explicitly check the results array for any prompt marked as 'failed'
      const hasFailedPrompts = results.some(r => r.status === "failed");

      // Determine final status based ONLY on the check above
      const finalStatusValue = hasFailedPrompts ? "failed" : "completed"; // Use string values directly
      const finalErrorMessage = hasFailedPrompts ? results.find(r => r.status === "failed")?.error : null;
      
      try {
        await tx.update(toolExecutionsTable).set({ 
            status: finalStatusValue, 
            errorMessage: finalErrorMessage, 
            completedAt: new Date() 
        }).where(eq(toolExecutionsTable.id, execution.id));
      } catch (finalUpdateError) {
          console.error(`[EXEC:${execution.id}] Failed to update final status: ${finalUpdateError}`);
          throw finalUpdateError; // Explicitly throw to ensure rollback
      }

      // If reached here, transaction is successful *within the callback*
      executionIdFromTx = execution.id;
      finalStatusFromTx = finalStatusValue as SelectToolExecution['status'];
      resultsFromTx = results; // Store results to return outside transaction

      console.log(`[EXEC:${execution.id}] Execution completed with status: ${finalStatusValue}`);
    }); // End transaction

    // If transaction promise resolved without throwing, it succeeded
    console.log(`[EXEC] Success for execution ${executionIdFromTx}`);
    return {
      isSuccess: true,
      message: "Assistant Architect executed successfully",
      // Use the data captured from the successful transaction
      data: { 
        executionId: executionIdFromTx, // Add executionId property for client
        id: executionIdFromTx, 
        status: finalStatusFromTx, 
        results: resultsFromTx 
      }
    };
  } catch (error) {
    console.error(`[EXEC] Error: ${error instanceof Error ? error.message : String(error)}`);
    // If we still captured the execution ID before the error, return that at least
    if (executionIdFromTx) {
      console.log(`[EXEC] Returning partial success with ID: ${executionIdFromTx}`);
      return {
        isSuccess: true,
        message: "Execution started but encountered issues",
        data: { 
          executionId: executionIdFromTx,
          id: executionIdFromTx,
          status: "failed" as SelectToolExecution['status'],
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
    return { isSuccess: false, message: "Failed to execute Assistant Architect" };
  }
}

// For the public view, get only approved tools
export async function getApprovedAssistantArchitectsAction(): Promise<
  ActionState<AssistantArchitectWithRelations[]>
> {
  try {
    console.log("Fetching approved Assistant Architects")
    
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized", data: [] }
    }
    
    // First, get all the tools the user has access to
    const userTools = await getUserTools(userId)
    if (userTools.length === 0) {
      return { isSuccess: true, message: "No tools available", data: [] }
    }
    
    // Get the base tools from the tools table
    const baseTools = await db
      .select()
      .from(toolsTable)
      .where(
        and(
          inArray(toolsTable.identifier, userTools),
          eq(toolsTable.isActive, true)
        )
      )
    
    // Extract assistant architect IDs
    const architectIds = baseTools
      .map(tool => tool.assistantArchitectId)
      .filter((id): id is string => id !== null)
    
    if (architectIds.length === 0) {
      return { isSuccess: true, message: "No approved architects found", data: [] }
    }
    
    // 1. Fetch approved architects that the user has access to
    const approvedArchitects = await db.query.assistantArchitects.findMany({
      where: and(
        eq(assistantArchitectsTable.status, "approved"),
        inArray(assistantArchitectsTable.id, architectIds)
      )
    });

    if (approvedArchitects.length === 0) {
      return { isSuccess: true, message: "No approved architects found", data: [] };
    }
    
    // 2. Fetch related fields and prompts
    const allInputFields = await db.query.toolInputFields.findMany({
        where: inArray(toolInputFieldsTable.toolId, architectIds),
        orderBy: [asc(toolInputFieldsTable.position)]
    });
    const allPrompts = await db.query.chainPrompts.findMany({
        where: inArray(chainPromptsTable.toolId, architectIds),
        orderBy: [asc(chainPromptsTable.position)]
    });

    // 3. Map relations back
    const results = approvedArchitects.map(architect => ({
      ...architect,
      inputFields: allInputFields.filter(f => f.toolId === architect.id) || [],
      prompts: allPrompts.filter(p => p.toolId === architect.id) || []
    }));

    return {
      isSuccess: true,
      message: "Approved Assistant Architects retrieved successfully",
      data: results
    }
  } catch (error) {
    console.error("Error getting approved Assistant Architects:", error)
    return { isSuccess: false, message: "Failed to get approved Assistant Architects" }
  }
}

export async function submitAssistantArchitectForApprovalAction(
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
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, id))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    if (tool.creatorId !== userId && !(await hasRole(userId, "administrator"))) {
      return { isSuccess: false, message: "Only the creator or an administrator can submit a tool for approval" }
    }

    // Check if the tool has the required components to be submitted
    const inputFields = await db
      .select()
      .from(toolInputFieldsTable)
      .where(eq(toolInputFieldsTable.toolId, id))

    const prompts = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.toolId, id))

    if (prompts.length === 0) {
      return { isSuccess: false, message: "Tool must have at least one prompt before submitting for approval" }
    }

    // Update the status to pending_approval
    await db
      .update(assistantArchitectsTable)
      .set({ status: "pending_approval" })
      .where(eq(assistantArchitectsTable.id, id))

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

// Action to get execution status and results
export async function getExecutionResultsAction(
  executionId: string
): Promise<ActionState<ExecutionResultDetails>> {
  const { userId } = await auth()
  if (!userId) return { isSuccess: false, message: "Unauthorized" }
  
  try {
    const execution = await db.query.toolExecutions.findFirst({
      where: and(eq(toolExecutionsTable.id, executionId), eq(toolExecutionsTable.userId, userId)),
      with: {
        promptResults: true 
      }
    });
    
    if (!execution) {
      console.log(`[RESULTS] Execution ${executionId} not found or access denied.`);
      return { isSuccess: false, message: "Execution not found or access denied" }
    }

    // Map prompt results to ensure consistency
    const mappedResults = execution.promptResults?.map(pr => ({
        id: pr.id,
        executionId: pr.executionId,
        promptId: pr.promptId,
        inputData: pr.inputData,
        outputData: pr.outputData,
        status: pr.status,
        errorMessage: pr.errorMessage,
        startedAt: pr.startedAt,
        completedAt: pr.completedAt,
        executionTimeMs: pr.executionTimeMs
    })) || [];
    
    // Return data in the ExecutionResultDetails format
    const returnData: ExecutionResultDetails = {
        ...execution,
        promptResults: mappedResults as SelectPromptResult[]
    };

    return {
      isSuccess: true,
      message: "Execution status retrieved",
      data: returnData
    }
  } catch (error) {
     console.error(`[RESULTS] Error getting results for ${executionId}: ${error}`)
    return { isSuccess: false, message: "Failed to get execution results" }
  }
}

/**
 * Helper function to migrate any database references that might still be using the old prompt-chains terminology
 * This is a one-time migration function that can be run to fix any issues
 */
export async function migratePromptChainsToAssistantArchitectAction(): Promise<ActionState<void>> {
  try {
    // This is just a placeholder for the migration function
    // The actual migration steps were done directly via database migrations
    // But we can use this function if we discover any other legacy references
    
    return {
      isSuccess: true,
      message: "Migration completed successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error migrating prompt chains to assistant architect:", error)
    return { 
      isSuccess: false, 
      message: "Failed to migrate prompt chains to assistant architect"
    }
  }
} 