"use server"

import { db } from "@/db/db"
import {
  assistantArchitectsTable,
  toolInputFieldsTable,
  chainPromptsTable,
  toolExecutionsTable,
  promptResultsTable,
  fieldTypeEnum,
  type InsertAssistantArchitect,
  type SelectAssistantArchitect,
  type InsertToolInputField,
  type InsertChainPrompt,
  type InsertToolExecution,
  type InsertPromptResult,
  type SelectToolInputField,
  type SelectChainPrompt,
  type SelectToolExecution,
  type SelectPromptResult,
  aiModelsTable,
  toolsTable,
  type SelectTool,
  rolesTable,
  roleToolsTable,
  type SelectAiModel,
  jobStatusEnum
} from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and, asc, inArray } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole, getUserTools } from "@/utils/roles"
import { generateCompletion } from "@/lib/ai-helpers"
import { generateToolIdentifier } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"
import { createJobAction, updateJobAction } from "@/actions/db/jobs-actions"

// Use inline type for architect with relations
type ArchitectWithRelations = SelectAssistantArchitect & {
  inputFields?: SelectToolInputField[];
  prompts?: SelectChainPrompt[];
}

// The missing function needed by page.tsx
export async function getAssistantArchitectAction(
  id: string
): Promise<ActionState<ArchitectWithRelations | undefined>> {
  // This is an alias for getAssistantArchitectByIdAction for backward compatibility
  return getAssistantArchitectByIdAction(id);
}

// Tool Management Actions

export async function createAssistantArchitectAction(
  data: InsertAssistantArchitect
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const [architect] = await db
      .insert(assistantArchitectsTable)
      .values({
        ...data,
        creatorId: userId
      })
      .returning()

    return {
      isSuccess: true,
      message: "Assistant architect created successfully",
      data: architect
    }
  } catch (error) {
    console.error("Error creating assistant architect:", error)
    return { isSuccess: false, message: "Failed to create assistant architect" }
  }
}

export async function getAssistantArchitectsAction(): Promise<
  ActionState<(SelectAssistantArchitect & {
    inputFields: SelectToolInputField[];
    prompts: SelectChainPrompt[];
  })[]>
> {
  try {
    const architects = await db.query.assistantArchitects.findMany({
      with: {
        inputFields: true,
        prompts: true
      }
    })

    return {
      isSuccess: true,
      message: "Assistant architects retrieved successfully",
      data: architects
    }
  } catch (error) {
    console.error("Error getting assistant architects:", error)
    return {
      isSuccess: false,
      message: "Failed to get assistant architects"
    }
  }
}

export async function getAssistantArchitectByIdAction(
  id: string
): Promise<ActionState<ArchitectWithRelations | undefined>> {
  try {
    const architect = await db.query.assistantArchitects.findFirst({
      where: eq(assistantArchitectsTable.id, id),
      with: {
        inputFields: true,
        prompts: true
      }
    })

    if (!architect) {
      return {
        isSuccess: false,
        message: "Assistant architect not found"
      }
    }

    return {
      isSuccess: true,
      message: "Assistant architect retrieved successfully",
      data: architect
    }
  } catch (error) {
    console.error("Error getting assistant architect:", error)
    return { isSuccess: false, message: "Failed to get assistant architect" }
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
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the current tool
    const [currentTool] = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, id))
      .limit(1)

    if (!currentTool) {
      return { isSuccess: false, message: "Assistant not found" }
    }

    if (currentTool.creatorId !== userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // If the tool was approved and is being edited, set status to pending_approval
    // and deactivate it in the tools table
    if (currentTool.status === "approved") {
      data.status = "pending_approval"
      
      // Deactivate the tool in the tools table
      await db
        .update(toolsTable)
        .set({ isActive: false })
        .where(eq(toolsTable.assistantArchitectId, id))
    }

    // Update the tool
    const [updatedTool] = await db
      .update(assistantArchitectsTable)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(assistantArchitectsTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Assistant updated successfully",
      data: updatedTool
    }
  } catch (error) {
    console.error("Error updating assistant:", error)
    return { isSuccess: false, message: "Failed to update assistant" }
  }
}

export async function deleteAssistantArchitectAction(
  id: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, id))

    return {
      isSuccess: true,
      message: "Assistant architect deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting assistant architect:", error)
    return { isSuccess: false, message: "Failed to delete assistant architect" }
  }
}

// Input Field Management Actions

export async function addToolInputFieldAction(
  architectId: string,
  data: { 
    name: string; 
    type: string;
    position?: number;
    options?: { label: string; value: string }[];
  }
): Promise<ActionState<void>> {
  try {
    await db.insert(toolInputFieldsTable).values({
      toolId: architectId,
      name: data.name,
      fieldType: data.type as typeof fieldTypeEnum.enumValues[number],
      position: data.position ?? 0,
      options: data.options
    })

    return {
      isSuccess: true,
      message: "Tool input field added successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error adding tool input field:", error)
    return { isSuccess: false, message: "Failed to add tool input field" }
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

export async function addChainPromptAction(
  architectId: string,
  data: {
    name: string
    content: string
    systemContext?: string
    modelId: number
    position: number
    inputMapping?: Record<string, string>
  }
): Promise<ActionState<void>> {
  try {
    await db.insert(chainPromptsTable).values({
      toolId: architectId,
      name: data.name,
      content: data.content,
      systemContext: data.systemContext,
      modelId: data.modelId,
      position: data.position,
      inputMapping: data.inputMapping
    })

    return {
      isSuccess: true,
      message: "Chain prompt added successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error adding chain prompt:", error)
    return { isSuccess: false, message: "Failed to add chain prompt" }
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
  position: number
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

    // Update the prompt's position
    await db
      .update(chainPromptsTable)
      .set({ position })
      .where(eq(chainPromptsTable.id, id))

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
  id: string
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
      const [updatedTool] = await tx.update(assistantArchitectsTable)
        .set({ status: "approved" })
        .where(eq(assistantArchitectsTable.id, id))
        .returning();
      
      if (!updatedTool) throw new Error("Tool not found");
      
      const [existingTool] = await tx.select()
        .from(toolsTable)
        .where(eq(toolsTable.assistantArchitectId, id));

      let identifier = generateToolIdentifier(updatedTool.name);
      if (!existingTool) {
        const [duplicateIdentifier] = await tx.select({ id: toolsTable.id })
          .from(toolsTable)
          .where(eq(toolsTable.identifier, identifier));
        if (duplicateIdentifier) identifier = `${identifier}-${uuidv4().slice(0, 8)}`;
      }
      
      // Data for updating/inserting into toolsTable
      const commonToolData = {
        identifier: identifier, 
        name: updatedTool.name,
        description: updatedTool.description,
        isActive: true,
        assistantArchitectId: id,
      };

      let finalToolId: string;

      if (existingTool) {
        await tx.update(toolsTable)
          .set(commonToolData)
          .where(eq(toolsTable.id, existingTool.id));
        finalToolId = existingTool.id;
      } else {
        // Ensure 'id' (PK) is provided for insert
        await tx.insert(toolsTable)
          .values({ ...commonToolData, id: identifier });
        finalToolId = identifier;
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
          toolId: finalToolId
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
  id: string
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
  input: Record<string, unknown>; // Input data specific to this prompt
  output?: string; // Output from AI
  error?: string; // Error message if failed
  startTime: Date;
  endTime: Date;
  executionTimeMs?: number;
}

export async function executeAssistantArchitectAction({
  toolId,
  inputs
}: {
  toolId: string
  inputs: Record<string, unknown>
}): Promise<ActionState<{ jobId: string }>> {
  console.log(`[EXEC] Started for tool ${toolId}`);
  
  try {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized");

    // First get the tool to check if it's approved
    const toolResult = await getAssistantArchitectByIdAction(toolId)
    if (!toolResult.isSuccess || !toolResult.data) throw new Error("Tool not found");
    const tool = toolResult.data;
    
    // Check if the tool is approved - only approved tools can be executed
    if (tool.status !== "approved") {
      throw new Error("Cannot execute a tool that is not approved");
    }

    // Create a job to track this execution
    const jobResult = await createJobAction({
      type: "assistant_architect_execution",
      status: "pending",
      input: JSON.stringify({ toolId, inputs }),
      userId
    });

    if (!jobResult.isSuccess) {
      throw new Error("Failed to create job");
    }

    // Start the execution in the background
    executeAssistantArchitectJob(jobResult.data.id, tool, inputs).catch(error => {
      console.error(`[EXEC:${jobResult.data.id}] Background execution failed:`, error);
    });

    return {
      isSuccess: true,
      message: "Execution started",
      data: { jobId: jobResult.data.id }
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[EXEC] Failed to start execution:`, errorMsg);
    return { isSuccess: false, message: errorMsg };
  }
}

async function executeAssistantArchitectJob(
  jobId: string,
  tool: ArchitectWithRelations,
  inputs: Record<string, unknown>
) {
  let execution: SelectToolExecution | null = null;
  const executionStartTime = new Date();
  const results: PromptExecutionResult[] = [];

  try {
    // Update job status to running
    await updateJobAction(jobId, { status: "running" });

    // Start transaction for the execution
    await db.transaction(async (tx) => {
      const [insertedExecution] = await tx.insert(toolExecutionsTable).values({
        toolId: tool.id,
        userId: tool.creatorId,
        inputData: inputs,
        status: "running",
        startedAt: executionStartTime
      }).returning();
      execution = insertedExecution;
      console.log(`[EXEC:${jobId}] Created execution ${execution.id}`);

      const prompts = tool.prompts?.sort((a: SelectChainPrompt, b: SelectChainPrompt) => (a.position ?? 0) - (b.position ?? 0)) || [];

      for (const [index, prompt] of prompts.entries()) {
        let promptResultRecord: SelectPromptResult | null = null;
        const promptStartTime = new Date();
        const promptInputData: Record<string, unknown> = { ...inputs };
        console.log(`[EXEC:${jobId}] Processing prompt ${index+1}/${prompts.length}: ${prompt.name}`);

        try {
          const [insertedPromptResult] = await tx.insert(promptResultsTable).values({
            executionId: execution.id,
            promptId: prompt.id,
            inputData: promptInputData,
            status: "pending",
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

          // Execute the prompt
          const messages = [
            {
              role: 'system',
              content: prompt.systemContext || 'You are a helpful AI assistant.'
            },
            {
              role: 'user',
              content: prompt.content.replace(/\${(\w+)}/g, (_match: string, key: string) => {
                const value = promptInputData[key]
                return value !== undefined ? String(value) : `[Missing value for ${key}]`
              }).trim() || "Please provide input for this prompt."
            }
          ];

          const output = await generateCompletion(
            {
              provider: model.provider,
              modelId: model.modelId
            },
            messages
          );

          const endTime = new Date();
          const executionTimeMs = endTime.getTime() - promptStartTime.getTime();

          // Update prompt result with success
          await tx.update(promptResultsTable)
            .set({
              status: "completed",
              outputData: output,
              completedAt: endTime,
              executionTimeMs
            })
            .where(eq(promptResultsTable.id, promptResultRecord.id));

          results.push({
            promptId: prompt.id,
            status: "completed",
            input: promptInputData,
            output,
            startTime: promptStartTime,
            endTime,
            executionTimeMs
          });

          console.log(`[EXEC:${jobId}] Completed prompt ${index+1}/${prompts.length}: ${prompt.name}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.error(`[EXEC:${jobId}] Error processing prompt ${index+1}: ${errorMsg}`);
          
          if (promptResultRecord) {
            await tx.update(promptResultsTable)
              .set({
                status: "failed",
                errorMessage: errorMsg,
                completedAt: new Date()
              })
              .where(eq(promptResultsTable.id, promptResultRecord.id));
          }

          results.push({
            promptId: prompt.id,
            status: "failed",
            input: promptInputData,
            error: errorMsg,
            startTime: promptStartTime,
            endTime: new Date()
          });

          if (!tool.isParallel) {
            console.log(`[EXEC:${jobId}] Stopping sequential execution due to failure`);
            throw error;
          }
        }
      }

      // Determine final status
      const hasFailedPrompts = results.some(r => r.status === "failed");
      const finalStatus = hasFailedPrompts ? "failed" : "completed";
      const finalErrorMessage = hasFailedPrompts ? results.find(r => r.status === "failed")?.error : null;

      // Update execution status
      if (execution) {
        const currentExecutionId = execution.id;
        await tx.update(toolExecutionsTable)
          .set({
            status: finalStatus,
            completedAt: new Date()
          })
          .where(eq(toolExecutionsTable.id, currentExecutionId));
      }

      // Update job with final status and results
      const finalExecutionId = execution?.id;
      await updateJobAction(jobId, {
        status: finalStatus as typeof jobStatusEnum.enumValues[number],
        output: JSON.stringify({
          executionId: finalExecutionId,
          results
        }),
        error: finalErrorMessage || undefined
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[EXEC:${jobId}] Execution failed:`, errorMsg);

    // Update execution status if it was created
    if (execution) {
      // Use type assertion to resolve TypeScript's flow analysis limitation
      const executionWithId = execution as SelectToolExecution;
      await db.update(toolExecutionsTable)
        .set({
          status: "failed",
          completedAt: new Date()
        })
        .where(eq(toolExecutionsTable.id, executionWithId.id));
    }

    // Update job with error
    await updateJobAction(jobId, {
      status: "failed",
      error: errorMsg,
      output: JSON.stringify({
        executionId: execution ? (execution as SelectToolExecution).id : undefined,
        results
      })
    });
  }
}

// For the public view, get only approved tools
export async function getApprovedAssistantArchitectsAction(): Promise<
  ActionState<ArchitectWithRelations[]>
> {
  try {
    console.log("Fetching approved Assistant Architects")
    
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // First, get all the tools the user has access to
    const userTools = await getUserTools(userId)
    if (userTools.length === 0) {
      return { isSuccess: true, message: "No assistants found", data: [] }
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
      return { isSuccess: true, message: "No assistants found", data: [] }
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
    const results: ArchitectWithRelations[] = approvedArchitects.map((architect: SelectAssistantArchitect) => ({
      ...architect,
      inputFields: allInputFields.filter((f: SelectToolInputField) => f.toolId === architect.id) || [],
      prompts: allPrompts.filter((p: SelectChainPrompt) => p.toolId === architect.id) || []
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

    const [tool] = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, id))
      .limit(1)

    if (!tool) {
      return { isSuccess: false, message: "Assistant not found" }
    }

    if (tool.userId !== userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    if (!tool.name || !tool.description || !tool.instructions || !tool.tools.length) {
      return { isSuccess: false, message: "Assistant is incomplete" }
    }

    await db
      .update(assistantArchitectsTable)
      .set({ status: "pending" })
      .where(eq(assistantArchitectsTable.id, id))

    return {
      isSuccess: true,
      message: "Assistant submitted for approval",
      data: undefined
    }
  } catch (error) {
    console.error("Error submitting assistant for approval:", error)
    return { isSuccess: false, message: "Failed to submit assistant" }
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
    const mappedResults = execution.promptResults?.map((pr: SelectPromptResult) => ({
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

export async function getToolsAction(): Promise<ActionState<SelectTool[]>> {
  try {
    const tools = await db.select().from(toolsTable)
    return {
      isSuccess: true,
      message: "Tools retrieved successfully",
      data: tools
    }
  } catch (error) {
    console.error("Error getting tools:", error)
    return { isSuccess: false, message: "Failed to get tools" }
  }
}

export async function getAiModelsAction(): Promise<ActionState<SelectAiModel[]>> {
  try {
    const aiModels = await db.select().from(aiModelsTable)
    return {
      isSuccess: true,
      message: "AI models retrieved successfully",
      data: aiModels
    }
  } catch (error) {
    console.error("Error getting AI models:", error)
    return { isSuccess: false, message: "Failed to get AI models" }
  }
}

export async function setPromptPositionsAction(
  toolId: string,
  positions: { id: string; position: number }[]
): Promise<ActionState<void>> {
  try {
    const { userId } = await auth()
    if (!userId) return { isSuccess: false, message: "Unauthorized" }

    // Verify permissions
    const [tool] = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, toolId))

    if (!tool) return { isSuccess: false, message: "Tool not found" }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.creatorId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    await db.transaction(async (tx) => {
      for (const { id, position } of positions) {
        await tx
          .update(chainPromptsTable)
          .set({ position })
          .where(eq(chainPromptsTable.id, id))
      }
    });

    return { isSuccess: true, message: "Prompt positions updated", data: undefined }
  } catch (error) {
    console.error("Error setting prompt positions:", error)
    return { isSuccess: false, message: "Failed to set prompt positions" }
  }
}

export async function getApprovedAssistantArchitectsForAdminAction(): Promise<
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
      return { isSuccess: false, message: "Only administrators can view approved tools" }
    }

    // Get all approved tools
    const approvedTools = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.status, "approved"));

    // Get related data for each tool
    const toolsWithRelations = await Promise.all(
      approvedTools.map(async (tool) => {
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
      message: "Approved Assistant Architects retrieved successfully",
      data: toolsWithRelations
    };
  } catch (error) {
    console.error("Error getting approved Assistant Architects:", error);
    return { isSuccess: false, message: "Failed to get approved Assistant Architects" };
  }
}