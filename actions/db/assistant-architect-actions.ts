"use server"

import {
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
  type SelectTool,
  type SelectAiModel
} from "@/types/db-types"
import { CoreMessage } from "ai"

import { createJobAction, updateJobAction, getJobAction } from "@/actions/db/jobs-actions";
import { generateCompletion } from "@/lib/ai-helpers";
import { createError, handleError, createSuccess } from "@/lib/error-utils";
import { generateToolIdentifier } from "@/lib/utils";
import { ActionState, ErrorLevel } from "@/types";
import { ExecutionResultDetails } from "@/types/assistant-architect-types";
import { hasRole, getUserTools } from "@/utils/roles";
import { createNavigationItemAction } from "@/actions/db/navigation-actions"
import logger from "@/lib/logger"
import { getServerSession } from "@/lib/auth/server-session";
import { executeSQL, checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter";
import { getCurrentUserAction } from "@/actions/db/get-current-user-action";
import { RDSDataClient, BeginTransactionCommand, ExecuteStatementCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";

// Use inline type for architect with relations
type ArchitectWithRelations = SelectAssistantArchitect & {
  inputFields?: SelectToolInputField[];
  prompts?: SelectChainPrompt[];
}

// Helper function to get current user ID
async function getCurrentUserId(): Promise<number | null> {
  const currentUser = await getCurrentUserAction();
  if (currentUser.isSuccess && currentUser.data) {
    return currentUser.data.user.id;
  }
  return null;
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
  assistant: InsertAssistantArchitect
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" };
    }

    // Get the current user's database ID
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess || !currentUser.data) {
      return { isSuccess: false, message: "User not found" };
    }

    const [architect] = await executeSQL(`
      INSERT INTO assistant_architects (name, description, status, image_path, user_id, created_at, updated_at)
      VALUES (:name, :description, :status::tool_status, :imagePath, :userId, NOW(), NOW())
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [
      { name: 'name', value: { stringValue: assistant.name } },
      { name: 'description', value: { stringValue: assistant.description } },
      { name: 'status', value: { stringValue: assistant.status } },
      { name: 'imagePath', value: { stringValue: assistant.imagePath } },
      { name: 'userId', value: { longValue: currentUser.data.user.id } }
    ]);

    return createSuccess(architect, "Assistant architect created successfully");
  } catch (error) {
    return handleError(error, "Failed to create assistant architect", {
      context: "createAssistantArchitectAction"
    });
  }
}

export async function getAssistantArchitectsAction(): Promise<
  ActionState<(SelectAssistantArchitect & {
    inputFields: SelectToolInputField[];
    prompts: SelectChainPrompt[];
    creator: { firstName: string; lastName: string; email: string } | null;
    cognito_sub: string;
  })[]>
> {
  try {
    const architects = await executeSQL(`
      SELECT a.id, a.name, a.description, a.status, a.image_path, a.user_id, a.created_at, a.updated_at,
             u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email,
             u.cognito_sub
      FROM assistant_architects a
      LEFT JOIN users u ON a.user_id = u.id
    `);

    const architectsWithRelations = await Promise.all(
      architects.map(async (architect) => {
        const [inputFields, prompts] = await Promise.all([
          executeSQL(`
            SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: architect.id } }]),
          executeSQL(`
            SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
            FROM chain_prompts
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: architect.id } }])
        ]);

        return {
          ...architect,
          inputFields,
          prompts,
          creator: architect.creator_first_name && architect.creator_last_name && architect.creator_email
            ? {
                firstName: architect.creator_first_name,
                lastName: architect.creator_last_name,
                email: architect.creator_email
              }
            : null
        };
      })
    );

    return createSuccess(architectsWithRelations, "Assistant architects retrieved successfully");
  } catch (error) {
    return handleError(error, "Failed to get assistant architects", {
      context: "getAssistantArchitectsAction"
    });
  }
}

export async function getAssistantArchitectByIdAction(
  id: string
): Promise<ActionState<ArchitectWithRelations | undefined>> {
  try {
    // Parse string ID to integer
    const idInt = parseInt(id, 10);
    if (isNaN(idInt)) {
      throw createError("Invalid assistant architect ID", {
        code: "VALIDATION",
        level: ErrorLevel.WARN,
        details: { id }
      });
    }

    const architectResult = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: idInt } }]);

    if (!architectResult || architectResult.length === 0) {
      throw createError("Assistant architect not found", {
        code: "NOT_FOUND",
        level: ErrorLevel.WARN,
        details: { id }
      });
    }

    const architect = architectResult[0];
    
    // Get input fields and prompts using data API
    const [inputFields, prompts] = await Promise.all([
      executeSQL(`
        SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE assistant_architect_id = :toolId
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { longValue: idInt } }]),
      executeSQL(`
        SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
        FROM chain_prompts
        WHERE assistant_architect_id = :toolId
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { longValue: idInt } }])
    ]);

    // Transform snake_case to camelCase for frontend compatibility
    const transformedInputFields = (inputFields || []).map((field: any) => ({
      id: field.id,
      toolId: field.assistant_architect_id,
      name: field.name,
      label: field.label,
      fieldType: field.field_type,
      position: field.position,
      options: field.options,
      createdAt: field.created_at,
      updatedAt: field.updated_at
    }));

    const transformedPrompts = (prompts || []).map((prompt: any) => ({
      id: prompt.id,
      toolId: prompt.assistant_architect_id,
      name: prompt.name,
      content: prompt.content,
      systemContext: prompt.system_context,
      modelId: prompt.model_id,
      position: prompt.position,
      inputMapping: prompt.input_mapping,
      createdAt: prompt.created_at,
      updatedAt: prompt.updated_at
    }));

    const architectWithRelations = {
      id: architect.id,
      name: architect.name,
      description: architect.description,
      status: architect.status,
      imagePath: architect.image_path,
      userId: architect.user_id,
      createdAt: architect.created_at,
      updatedAt: architect.updated_at,
      inputFields: transformedInputFields,
      prompts: transformedPrompts
    };

    return createSuccess(architectWithRelations, "Assistant architect retrieved successfully");
  } catch (error) {
    return handleError(error, "Failed to get assistant architect", {
      context: "getAssistantArchitectByIdAction"
    });
  }
}

export async function getPendingAssistantArchitectsAction(): Promise<
  ActionState<SelectAssistantArchitect[]>
> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator using Cognito sub
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view pending tools" }
    }

    // Get pending tools using data API
    const pendingTools = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE status = 'pending_approval'
      ORDER BY created_at DESC
    `);

    // For each tool, get its input fields and prompts
    const toolsWithRelations = await Promise.all(
      pendingTools.map(async (tool: any) => {
        const [inputFields, prompts] = await Promise.all([
          executeSQL(`
            SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }]),
          executeSQL(`
            SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
            FROM chain_prompts
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }])
        ]);

        return {
          ...tool,
          inputFields: inputFields || [],
          prompts: prompts || []
        };
      })
    );

    return {
      isSuccess: true,
      message: "Pending Assistant Architects retrieved successfully",
      data: toolsWithRelations
    };
  } catch (error) {
    logger.error("Error getting pending Assistant Architects:", error);
    return { isSuccess: false, message: "Failed to get pending Assistant Architects" };
  }
}

export async function updateAssistantArchitectAction(
  id: string,
  data: Partial<InsertAssistantArchitect>
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // Get the current tool using data API
    const currentToolResult = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    if (!currentToolResult || currentToolResult.length === 0) {
      return { isSuccess: false, message: "Assistant not found" }
    }
    
    const currentTool = currentToolResult[0];
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    
    // Get the current user's database ID
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess || !currentUser.data) {
      return { isSuccess: false, message: "User not found" }
    }
    
    const isCreator = currentTool.user_id === currentUser.data.user.id
    if (!isAdmin && !isCreator) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // If the tool was approved and is being edited, set status to pending_approval and deactivate it in the tools table
    if (currentTool.status === "approved") {
      data.status = "pending_approval"
      await executeSQL(`
        UPDATE tools 
        SET is_active = false 
        WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    }
    
    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { longValue: parseInt(id, 10) } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'imagePath' ? 'image_path' : key === 'userId' ? 'user_id' : key;
        // Add type cast for status field
        if (key === 'status') {
          updateFields.push(`${snakeKey} = :param${paramIndex}::tool_status`);
        } else {
          updateFields.push(`${snakeKey} = :param${paramIndex}`);
        }
        
        let paramValue: any;
        if (value === null) {
          paramValue = { isNull: true };
        } else if (key === 'userId' && typeof value === 'number') {
          paramValue = { longValue: value };
        } else {
          paramValue = { stringValue: String(value) };
        }
        
        parameters.push({ 
          name: `param${paramIndex}`, 
          value: paramValue
        });
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }
    
    const updatedToolResult = await executeSQL(`
      UPDATE assistant_architects 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, parameters);
    
    return {
      isSuccess: true,
      message: "Assistant updated successfully",
      data: updatedToolResult[0]
    }
  } catch (error) {
    logger.error("Error updating assistant:", error)
    return { isSuccess: false, message: "Failed to update assistant" }
  }
}

export async function deleteAssistantArchitectAction(
  id: string
): Promise<ActionState<void>> {
  try {
    // First delete all related records in the correct order
    // Delete prompt_results (references chain_prompts)
    await executeSQL(`
      DELETE FROM prompt_results
      WHERE prompt_id IN (
        SELECT id FROM chain_prompts WHERE assistant_architect_id = :id
      )
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete tool_executions (which might have prompt_results)
    await executeSQL(`
      DELETE FROM tool_executions
      WHERE assistant_architect_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete chain_prompts
    await executeSQL(`
      DELETE FROM chain_prompts
      WHERE assistant_architect_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete tool_input_fields
    await executeSQL(`
      DELETE FROM tool_input_fields
      WHERE assistant_architect_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete from tools table (using prompt_chain_tool_id which references assistant_architect)
    await executeSQL(`
      DELETE FROM tools
      WHERE prompt_chain_tool_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete from navigation_items
    await executeSQL(`
      DELETE FROM navigation_items
      WHERE link = :link
    `, [{ name: 'link', value: { stringValue: `/tools/assistant-architect/${id}` } }]);
    
    // Finally delete the assistant architect
    await executeSQL(`
      DELETE FROM assistant_architects
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    return {
      isSuccess: true,
      message: "Assistant architect deleted successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error deleting assistant architect:", error)
    return { isSuccess: false, message: "Failed to delete assistant architect" }
  }
}

// Input Field Management Actions

export async function addToolInputFieldAction(
  architectId: string,
  data: { 
    name: string; 
    label?: string;
    type: string;
    position?: number;
    options?: { label: string; value: string }[];
  }
): Promise<ActionState<void>> {
  try {
    await executeSQL(`
      INSERT INTO tool_input_fields (assistant_architect_id, name, label, field_type, position, options, created_at, updated_at)
      VALUES (:toolId, :name, :label, :fieldType::field_type, :position, :options, NOW(), NOW())
    `, [
      { name: 'toolId', value: { longValue: parseInt(architectId, 10) } },
      { name: 'name', value: { stringValue: data.name } },
      { name: 'label', value: { stringValue: data.label ?? data.name } },
      { name: 'fieldType', value: { stringValue: data.type } },
      { name: 'position', value: { longValue: data.position ?? 0 } },
      { name: 'options', value: data.options ? { stringValue: JSON.stringify(data.options) } : { isNull: true } }
    ]);

    return {
      isSuccess: true,
      message: "Tool input field added successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error adding tool input field:", error)
    return { isSuccess: false, message: "Failed to add tool input field" }
  }
}

export async function deleteInputFieldAction(
  fieldId: string
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the field to find its tool using data API
    const fieldResult = await executeSQL(`
      SELECT id, assistant_architect_id
      FROM tool_input_fields
      WHERE id = :fieldId
    `, [{ name: 'fieldId', value: { longValue: parseInt(fieldId, 10) } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Check if user is the creator of the tool
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: field.assistant_architect_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Check permissions
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (!isAdmin && tool.user_id !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the field
    await executeSQL(`
      DELETE FROM tool_input_fields
      WHERE id = :fieldId
    `, [{ name: 'fieldId', value: { longValue: parseInt(fieldId, 10) } }]);

    return {
      isSuccess: true,
      message: "Input field deleted successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error deleting input field:", error)
    return { isSuccess: false, message: "Failed to delete input field" }
  }
}

export async function updateInputFieldAction(
  id: string,
  data: Partial<InsertToolInputField>
): Promise<ActionState<SelectToolInputField>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the field using data API
    const fieldResult = await executeSQL(`
      SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
      FROM tool_input_fields
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: field.assistant_architect_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can update fields
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (!isAdmin && tool.user_id !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { longValue: parseInt(id, 10) } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'fieldType' ? 'field_type' : key === 'toolId' ? 'assistant_architect_id' : key;
        if (key === 'fieldType') {
          updateFields.push(`${snakeKey} = :param${paramIndex}::field_type`);
        } else {
          updateFields.push(`${snakeKey} = :param${paramIndex}`);
        }
        
        let paramValue;
        if (value === null) {
          paramValue = { isNull: true };
        } else if (typeof value === 'number') {
          paramValue = { longValue: value };
        } else if (typeof value === 'object') {
          paramValue = { stringValue: JSON.stringify(value) };
        } else {
          paramValue = { stringValue: String(value) };
        }
        
        parameters.push({ name: `param${paramIndex}`, value: paramValue });
        paramIndex++;
      }
    }
    
    // Always ensure label is set
    if (!data.label && data.name) {
      updateFields.push(`label = :labelParam`);
      parameters.push({ name: 'labelParam', value: { stringValue: data.name } });
    }
    
    if (updateFields.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }

    const updatedFieldResult = await executeSQL(`
      UPDATE tool_input_fields 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
    `, parameters);

    return {
      isSuccess: true,
      message: "Input field updated successfully",
      data: updatedFieldResult[0]
    }
  } catch (error) {
    logger.error("Error updating input field:", error)
    return { isSuccess: false, message: "Failed to update input field" }
  }
}

export async function reorderInputFieldsAction(
  toolId: string,
  fieldOrders: { id: string; position: number }[]
): Promise<ActionState<SelectToolInputField[]>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: parseInt(toolId, 10) } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can reorder fields
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (!isAdmin && tool.user_id !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update each field's position
    const updatedFields = await Promise.all(
      fieldOrders.map(async ({ id, position }) => {
        const result = await executeSQL(`
          UPDATE tool_input_fields
          SET position = :position, updated_at = NOW()
          WHERE id = :id
          RETURNING id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        `, [
          { name: 'position', value: { longValue: position } },
          { name: 'id', value: { longValue: parseInt(id, 10) } }
        ]);
        return result[0];
      })
    )

    return {
      isSuccess: true,
      message: "Input fields reordered successfully",
      data: updatedFields
    }
  } catch (error) {
    logger.error("Error reordering input fields:", error)
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
    await executeSQL(`
      INSERT INTO chain_prompts (assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at)
      VALUES (:toolId, :name, :content, :systemContext, :modelId, :position, :inputMapping, NOW(), NOW())
    `, [
      { name: 'toolId', value: { longValue: parseInt(architectId, 10) } },
      { name: 'name', value: { stringValue: data.name } },
      { name: 'content', value: { stringValue: data.content } },
      { name: 'systemContext', value: data.systemContext ? { stringValue: data.systemContext } : { isNull: true } },
      { name: 'modelId', value: { longValue: data.modelId } },
      { name: 'position', value: { longValue: data.position } },
      { name: 'inputMapping', value: data.inputMapping ? { stringValue: JSON.stringify(data.inputMapping) } : { isNull: true } }
    ]);

    return {
      isSuccess: true,
      message: "Chain prompt added successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error adding chain prompt:", error)
    return { isSuccess: false, message: "Failed to add chain prompt" }
  }
}

export async function updatePromptAction(
  id: string,
  data: Partial<InsertChainPrompt>
): Promise<ActionState<SelectChainPrompt>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the prompt using data API
    const promptResult = await executeSQL(`
      SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
      FROM chain_prompts
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: prompt.assistant_architect_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can update prompts
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (!isAdmin && tool.user_id !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { longValue: parseInt(id, 10) } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'toolId' ? 'assistant_architect_id' : 
                        key === 'systemContext' ? 'system_context' : 
                        key === 'modelId' ? 'model_id' : 
                        key === 'inputMapping' ? 'input_mapping' : key;
        
        updateFields.push(`${snakeKey} = :param${paramIndex}`);
        
        let paramValue;
        if (value === null) {
          paramValue = { isNull: true };
        } else if (typeof value === 'number') {
          paramValue = { longValue: value };
        } else if (typeof value === 'object') {
          paramValue = { stringValue: JSON.stringify(value) };
        } else {
          paramValue = { stringValue: String(value) };
        }
        
        parameters.push({ name: `param${paramIndex}`, value: paramValue });
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }

    const updatedPromptResult = await executeSQL(`
      UPDATE chain_prompts 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
    `, parameters);

    return {
      isSuccess: true,
      message: "Prompt updated successfully",
      data: updatedPromptResult[0]
    }
  } catch (error) {
    logger.error("Error updating prompt:", error)
    return { isSuccess: false, message: "Failed to update prompt" }
  }
}

export async function deletePromptAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Find the prompt using data API
    const promptResult = await executeSQL(`
      SELECT assistant_architect_id
      FROM chain_prompts
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: prompt.assistant_architect_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can delete prompts
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (!isAdmin && tool.user_id !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the prompt
    await executeSQL(`
      DELETE FROM chain_prompts
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    return {
      isSuccess: true,
      message: "Prompt deleted successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error deleting prompt:", error)
    return { isSuccess: false, message: "Failed to delete prompt" }
  }
}

export async function updatePromptPositionAction(
  id: string,
  position: number
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      return { isSuccess: false, message: "User not found" }
    }

    // Find the prompt
    const promptResult = await executeSQL(
      `SELECT * FROM chain_prompts WHERE id = :id`,
      [{ name: 'id', value: { longValue: parseInt(id, 10) } }]
    )

    if (!promptResult.records || promptResult.records.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult.records[0]
    const toolId = prompt[1]?.stringValue // toolId is at index 1

    // Get the tool to check permissions
    const toolResult = await executeSQL(
      `SELECT * FROM assistant_architects WHERE id = :id`,
      [{ name: 'id', value: { longValue: parseInt(toolId, 10) } }]
    )

    if (!toolResult.records || toolResult.records.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult.records[0]
    const toolUserId = tool[5]?.stringValue // userId is at index 5

    // Only tool creator or admin can update prompt positions
    const isAdmin = await hasRole("administrator")
    if (!isAdmin && toolUserId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update the prompt's position
    await executeSQL(
      `UPDATE chain_prompts SET position = :position WHERE id = :id`,
      [
        { name: 'position', value: { longValue: position } },
        { name: 'id', value: { longValue: parseInt(id, 10) } }
      ]
    )

    return {
      isSuccess: true,
      message: "Prompt position updated successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error updating prompt position:", error)
    return { isSuccess: false, message: "Failed to update prompt position" }
  }
}

// Tool Execution Actions

export async function createToolExecutionAction(
  execution: InsertToolExecution
): Promise<ActionState<string>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      return { isSuccess: false, message: "User not found" }
    }

    execution.userId = userId

    const [executionResult] = await executeSQL(
      `INSERT INTO tool_executions (assistant_architect_id, user_id, input_data, status, started_at) 
       VALUES (:toolId, :userId, :inputData, :status, NOW())
       RETURNING id`,
      [
        { name: 'toolId', value: { longValue: execution.assistantArchitectId } },
        { name: 'userId', value: { longValue: execution.userId } },
        { name: 'inputData', value: { stringValue: JSON.stringify(execution.inputData || {}) } },
        { name: 'status', value: { stringValue: 'pending' } }
      ]
    )
    
    const executionId = executionResult.id

    return {
      isSuccess: true,
      message: "Tool execution created successfully",
      data: executionId
    }
  } catch (error) {
    logger.error("Error creating tool execution:", error)
    return { isSuccess: false, message: "Failed to create tool execution" }
  }
}

export async function updatePromptResultAction(
  executionId: string,
  promptId: number,
  result: Record<string, any>
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      return { isSuccess: false, message: "User not found" }
    }

    const updates: { name: string; value: any }[] = []
    const setClauses: string[] = []

    if (result.result !== undefined) {
      setClauses.push('result = :result')
      updates.push({ name: 'result', value: { stringValue: result.result } })
    }
    if (result.error !== undefined) {
      setClauses.push('error = :error')
      updates.push({ name: 'error', value: { stringValue: result.error } })
    }
    if (result.executionTime !== undefined) {
      setClauses.push('execution_time = :executionTime')
      updates.push({ name: 'executionTime', value: { longValue: result.executionTime } })
    }
    if (result.tokensUsed !== undefined) {
      setClauses.push('tokens_used = :tokensUsed')
      updates.push({ name: 'tokensUsed', value: { longValue: result.tokensUsed } })
    }

    if (setClauses.length === 0) {
      return { isSuccess: true, message: "No updates to apply", data: undefined }
    }

    updates.push(
      { name: 'executionId', value: { longValue: parseInt(executionId, 10) } },
      { name: 'promptId', value: { longValue: parseInt(promptId, 10) } }
    )

    await executeSQL(
      `UPDATE prompt_results SET ${setClauses.join(', ')} 
       WHERE execution_id = :executionId AND prompt_id = :promptId`,
      updates
    )

    return {
      isSuccess: true,
      message: "Prompt result updated successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error updating prompt result:", error)
    return { isSuccess: false, message: "Failed to update prompt result" }
  }
}

// Tool Approval Actions

export async function approveAssistantArchitectAction(
  id: string
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can approve tools" }
    }

    // Update the tool status to approved
    const updatedToolResult = await executeSQL(`
      UPDATE assistant_architects
      SET status = 'approved'::tool_status, updated_at = NOW()
      WHERE id = :id
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    if (!updatedToolResult || updatedToolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }
    
    const updatedTool = updatedToolResult[0];
    
    // Check if tool already exists in tools table
    const existingToolResult = await executeSQL(`
      SELECT id FROM tools WHERE assistant_architect_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    let identifier = generateToolIdentifier(updatedTool.name);
    let finalToolId: string;
    
    if (existingToolResult && existingToolResult.length > 0) {
      // Update existing tool
      await executeSQL(`
        UPDATE tools
        SET identifier = :identifier, name = :name, description = :description, is_active = true, updated_at = NOW()
        WHERE assistant_architect_id = :id
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description } },
        { name: 'id', value: { longValue: parseInt(id, 10) } }
      ]);
      finalToolId = existingToolResult[0].id;
    } else {
      // Check for duplicate identifier
      const duplicateResult = await executeSQL(`
        SELECT id FROM tools WHERE identifier = :identifier
      `, [{ name: 'identifier', value: { stringValue: identifier } }]);
      
      if (duplicateResult && duplicateResult.length > 0) {
        identifier = `${identifier}-${Date.now()}`;
      }
      
      // Create new tool
      const newToolResult = await executeSQL(`
        INSERT INTO tools (id, identifier, name, description, is_active, assistant_architect_id, created_at, updated_at)
        VALUES (:identifier, :identifier, :name, :description, true, :assistantArchitectId, NOW(), NOW())
        RETURNING id
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description } },
        { name: 'assistantArchitectId', value: { longValue: parseInt(id, 10) } }
      ]);
      finalToolId = newToolResult[0].id;
    }
    
    // Create navigation item if it doesn't exist
    const navLink = `/tools/assistant-architect/${id}`;
    const existingNavResult = await executeSQL(`
      SELECT id FROM navigation_items WHERE parent_id = 'experiments' AND link = :link
    `, [{ name: 'link', value: { stringValue: navLink } }]);
    
    if (!existingNavResult || existingNavResult.length === 0) {
      let baseNavId = generateToolIdentifier(updatedTool.name);
      let navId = baseNavId;
      let navSuffix = 2;
      
      // Check for unique navigation ID
      let navExists = true;
      while (navExists) {
        const navCheckResult = await executeSQL(`
          SELECT id FROM navigation_items WHERE id = :navId
        `, [{ name: 'navId', value: { stringValue: navId } }]);
        
        if (!navCheckResult || navCheckResult.length === 0) {
          navExists = false;
        } else {
          navId = `${baseNavId}-${navSuffix++}`;
        }
      }
      
      await executeSQL(`
        INSERT INTO navigation_items (id, label, icon, link, type, parent_id, tool_id, is_active, created_at)
        VALUES (:navId, :label, 'IconWand', :link, 'link', 'experiments', :toolId, true, NOW())
      `, [
        { name: 'navId', value: { stringValue: navId } },
        { name: 'label', value: { stringValue: updatedTool.name } },
        { name: 'link', value: { stringValue: navLink } },
        { name: 'toolId', value: { stringValue: finalToolId } }
      ]);
    }
    
    // Assign tool to staff and administrator roles
    const rolesResult = await executeSQL(`
      SELECT id, name FROM roles WHERE name IN ('staff', 'administrator')
    `);
    
    for (const role of rolesResult) {
      // Check if assignment already exists
      const existingAssignmentResult = await executeSQL(`
        SELECT 1 FROM role_tools WHERE role_id = :roleId AND tool_id = :toolId
      `, [
        { name: 'roleId', value: { stringValue: role.id } },
        { name: 'toolId', value: { stringValue: finalToolId } }
      ]);
      
      if (!existingAssignmentResult || existingAssignmentResult.length === 0) {
        await executeSQL(`
          INSERT INTO role_tools (role_id, tool_id, created_at)
          VALUES (:roleId, :toolId, NOW())
        `, [
          { name: 'roleId', value: { stringValue: role.id } },
          { name: 'toolId', value: { stringValue: finalToolId } }
        ]);
      }
    }
    
    return {
      isSuccess: true,
      message: "Tool approved successfully",
      data: updatedTool
    }
  } catch (error) {
    logger.error("Error approving tool:", error)
    return { isSuccess: false, message: "Failed to approve tool" }
  }
}

export async function rejectAssistantArchitectAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Check if user is an administrator
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can reject tools" }
    }

    await executeSQL(`
      UPDATE assistant_architects
      SET status = 'rejected'::tool_status, updated_at = NOW()
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    return {
      isSuccess: true,
      message: "Tool rejected successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error rejecting Assistant Architect:", error)
    return { isSuccess: false, message: "Failed to reject tool" }
  }
}

// Define a type for the prompt execution result structure
interface PromptExecutionResult {
  promptId: number;
  status: "completed" | "failed";
  input: Record<string, unknown>; // Input data specific to this prompt
  output?: string; // Output from AI
  error?: string; // Error message if failed
  startTime: Date;
  endTime: Date;
  executionTimeMs?: number;
}

// Add a function to decode HTML entities and remove escapes for variable placeholders
function decodePromptVariables(content: string): string {
  // Replace HTML entity for $ with $
  let decoded = content.replace(/&#x24;|&\#36;/g, '$');
  // Remove backslash escapes before $
  decoded = decoded.replace(/\\\$/g, '$');
  // Remove backslash escapes before {
  decoded = decoded.replace(/\\\{/g, '{');
  // Remove backslash escapes before }
  decoded = decoded.replace(/\\\}/g, '}');
  // Remove backslash escapes before _
  decoded = decoded.replace(/\\_/g, '_');
  return decoded;
}

// Add slugify utility at the top (before executeAssistantArchitectJob)
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export async function executeAssistantArchitectAction({
  toolId,
  inputs
}: {
  toolId: number | string
  inputs: Record<string, unknown>
}): Promise<ActionState<{ jobId: number; executionId?: number }>> {
  logger.info(`[EXEC] Started for tool ${toolId}`);
  
  try {
    const session = await getServerSession();
    if (!session?.sub) {
      throw createError("Unauthorized", {
        code: "UNAUTHORIZED",
        level: ErrorLevel.WARN
      });
    }

    // Get the current user's database ID
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      throw createError("User not found", {
        code: "UNAUTHORIZED",
        level: ErrorLevel.WARN
      });
    }

    // First get the tool to check if it exists and user has access
    const toolResult = await getAssistantArchitectByIdAction(String(toolId))
    if (!toolResult.isSuccess || !toolResult.data) {
      throw createError("Tool not found", {
        code: "NOT_FOUND",
        level: ErrorLevel.ERROR,
        details: { toolId }
      });
    }
    const tool = toolResult.data;
    
    // Create a job to track this execution
    const jobResult = await createJobAction({
      type: "assistant_architect_execution",
      status: "pending",
      input: JSON.stringify({ toolId, inputs }),
      userId: currentUser.data.user.id
    });

    if (!jobResult.isSuccess) {
      throw createError("Failed to create execution job", {
        code: "INTERNAL_ERROR",
        level: ErrorLevel.ERROR,
        details: { toolId }
      });
    }

    // Create the execution record immediately so we can return the ID
    const executionResult = await executeSQL(
      `INSERT INTO tool_executions (assistant_architect_id, user_id, input_data, status, started_at)
       VALUES (:toolId, :userId, :inputData::jsonb, :status::execution_status, NOW())
       RETURNING id`,
      [
        { name: 'toolId', value: { longValue: parseInt(String(toolId), 10) } },
        { name: 'userId', value: { longValue: currentUser.data.user.id } },
        { name: 'inputData', value: { stringValue: JSON.stringify(inputs) } },
        { name: 'status', value: { stringValue: 'pending' } }
      ]
    );

    const executionId = executionResult[0]?.id;

    // Start the execution in the background
    executeAssistantArchitectJob(jobResult.data.id.toString(), tool, inputs, executionId).catch(error => {
      logger.error(`[EXEC:${jobResult.data.id}] Background execution failed:`, error);
    });

    return createSuccess({ jobId: jobResult.data.id, executionId }, "Execution started");
  } catch (error) {
    return handleError(error, "Failed to execute assistant architect", {
      context: "executeAssistantArchitectAction"
    });
  }
}

async function executeAssistantArchitectJob(
  jobId: string,
  tool: ArchitectWithRelations,
  inputs: Record<string, unknown>,
  providedExecutionId?: number
) {
  const executionStartTime = new Date();
  const results: PromptExecutionResult[] = [];
  let executionId: number | null = providedExecutionId || null;
  
  const rdsDataClient = new RDSDataClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const dataApiConfig = {
    resourceArn: process.env.RDS_RESOURCE_ARN!,
    secretArn: process.env.RDS_SECRET_ARN!,
    database: process.env.RDS_DATABASE_NAME || 'aistudio',
  };

  const beginTransactionCmd = new BeginTransactionCommand(dataApiConfig);
  const { transactionId } = await rdsDataClient.send(beginTransactionCmd);

  if (!transactionId) {
    await updateJobAction(jobId, { status: "failed", error: "Failed to start a database transaction." });
    return;
  }
  
  try {
    await updateJobAction(jobId, { status: "running" });

    // Get the job to find the user ID
    const jobResult = await getJobAction(jobId);
    if (!jobResult.isSuccess || !jobResult.data) {
      throw new Error("Failed to get job data");
    }
    
    // If we already have an executionId, update it. Otherwise create a new one.
    if (providedExecutionId) {
      // Update existing execution
      const updateExecutionSql = `
        UPDATE tool_executions 
        SET status = :status::execution_status, started_at = :startedAt::timestamp
        WHERE id = :executionId
      `;
      await rdsDataClient.send(new ExecuteStatementCommand({
        ...dataApiConfig,
        sql: updateExecutionSql,
        parameters: [
          { name: 'executionId', value: { longValue: providedExecutionId } },
          { name: 'status', value: { stringValue: 'running' } },
          { name: 'startedAt', value: { stringValue: executionStartTime.toISOString().slice(0, 19).replace('T', ' ') } },
        ],
        transactionId,
      }));
    } else {
      // Create new execution (for backward compatibility)
      const insertExecutionSql = `
        INSERT INTO tool_executions (assistant_architect_id, user_id, input_data, status, started_at)
        VALUES (:toolId, :userId, :inputData::jsonb, :status::execution_status, :startedAt::timestamp)
        RETURNING id
      `;
      const executionResult = await rdsDataClient.send(new ExecuteStatementCommand({
        ...dataApiConfig,
        sql: insertExecutionSql,
        parameters: [
          { name: 'toolId', value: { longValue: parseInt(tool.id, 10) } },
          { name: 'userId', value: { longValue: jobResult.data.userId } },
          { name: 'inputData', value: { stringValue: JSON.stringify(inputs) } },
          { name: 'status', value: { stringValue: 'running' } },
          { name: 'startedAt', value: { stringValue: executionStartTime.toISOString().slice(0, 19).replace('T', ' ') } }
        ],
        transactionId,
      }));
      
      if (!executionResult.records || executionResult.records.length === 0) {
        throw new Error("Failed to create execution record");
      }
      executionId = executionResult.records[0][0].longValue;
    }

    const prompts = tool.prompts?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) || [];
    for (const prompt of prompts) {
      const promptStartTime = new Date();
      const promptInputData: Record<string, any> = { ...inputs };
      
      // Map outputs from previous prompts
      for (const prevResult of results) {
        const prevPrompt = tool.prompts?.find(p => p.id === prevResult.promptId);
        if (prevPrompt) {
          promptInputData[slugify(prevPrompt.name)] = prevResult.output;
        }
      }

      // Map inputs based on inputMapping
      if (prompt.inputMapping) {
        for (const [key, value] of Object.entries(prompt.inputMapping as Record<string, string>)) {
          if (value.startsWith("input.")) {
            const inputName = value.substring(6);
            promptInputData[key] = inputs[inputName];
          } else { // It's a prompt output mapping
             const prevPrompt = tool.prompts?.find(p => p.id === value);
             if (prevPrompt) {
                const prevResult = results.find(r => r.promptId === prevPrompt.id);
                if (prevResult) {
                    promptInputData[key] = prevResult.output;
                }
             }
          }
        }
      }
      
      let newPromptResultId: number | null = null;
      
      try {
        const insertPromptResultResult = await rdsDataClient.send(new ExecuteStatementCommand({ ...dataApiConfig, 
            sql: `INSERT INTO prompt_results (execution_id, prompt_id, input_data, status, started_at)
                  VALUES (:executionId, :promptId, :inputData::jsonb, 'pending'::execution_status, :startedAt::timestamp)
                  RETURNING id`,
            parameters: [
                { name: 'executionId', value: { longValue: executionId } },
                { name: 'promptId', value: { longValue: parseInt(prompt.id, 10) } },
                { name: 'inputData', value: { stringValue: JSON.stringify(promptInputData) } },
                { name: 'startedAt', value: { stringValue: promptStartTime.toISOString().slice(0, 19).replace('T', ' ') } },
            ],
            transactionId
        }));
        
        if (!insertPromptResultResult.records || insertPromptResultResult.records.length === 0) {
          throw new Error("Failed to create prompt result record");
        }
        newPromptResultId = insertPromptResultResult.records[0][0].longValue;
        
        const modelRecord = (await executeSQL('SELECT model_id, provider FROM ai_models WHERE id = :id', [{name: 'id', value: {longValue: prompt.modelId}}]))[0];
        if (!modelRecord) throw new Error("Model not found");

        const messages: CoreMessage[] = [
          {
            role: 'system',
            content: prompt.systemContext || 'You are a helpful AI assistant.'
          },
          {
            role: 'user',
            content: decodePromptVariables(prompt.content).replace(/\${([\w-]+)}/g, (_match: string, key: string) => {
              const value = promptInputData[key]
              return value !== undefined ? String(value) : `[Missing value for ${key}]`
            }).trim() || "Please provide input for this prompt."
          }
        ];

        const output = await generateCompletion({ provider: modelRecord.provider, modelId: modelRecord.model_id }, messages);

        await rdsDataClient.send(new ExecuteStatementCommand({ ...dataApiConfig,
            sql: `UPDATE prompt_results SET status = 'completed'::execution_status, output_data = :output, completed_at = :completedAt::timestamp, execution_time_ms = :execTime WHERE id = :id`,
            parameters: [
                { name: 'output', value: { stringValue: output } },
                { name: 'completedAt', value: { stringValue: new Date().toISOString().slice(0, 19).replace('T', ' ') } },
                { name: 'execTime', value: { longValue: new Date().getTime() - promptStartTime.getTime() } },
                { name: 'id', value: { longValue: newPromptResultId } }
            ],
            transactionId
        }));
        results.push({ promptId: prompt.id, status: "completed", input: promptInputData, output, startTime: promptStartTime, endTime: new Date(), executionTimeMs: 0 });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown prompt error';
        if (newPromptResultId) {
          await rdsDataClient.send(new ExecuteStatementCommand({ ...dataApiConfig,
              sql: `UPDATE prompt_results SET status = 'failed'::execution_status, error_message = :errorMsg, completed_at = :completedAt::timestamp WHERE id = :id`,
              parameters: [
                  { name: 'errorMsg', value: { stringValue: errorMsg } },
                  { name: 'completedAt', value: { stringValue: new Date().toISOString().slice(0, 19).replace('T', ' ') } },
                  { name: 'id', value: { longValue: newPromptResultId } }
            ],
            transactionId
          }));
        }
        results.push({ promptId: prompt.id, status: "failed", input: promptInputData, error: errorMsg, startTime: promptStartTime, endTime: new Date() });
      }
    }

    const finalStatus = results.some(r => r.status === "failed") ? "failed" : "completed";
    await rdsDataClient.send(new ExecuteStatementCommand({ ...dataApiConfig, 
        sql: `UPDATE tool_executions SET status = :status::execution_status, completed_at = :completedAt::timestamp WHERE id = :id`,
        parameters: [
            { name: 'status', value: { stringValue: finalStatus } },
            { name: 'completedAt', value: { stringValue: new Date().toISOString().slice(0, 19).replace('T', ' ') } },
            { name: 'id', value: { longValue: executionId } }
        ],
        transactionId
    }));
    await rdsDataClient.send(new CommitTransactionCommand({ ...dataApiConfig, transactionId }));
    await updateJobAction(jobId, { status: finalStatus, output: JSON.stringify({ executionId, results }) });
  } catch (error) {
    await rdsDataClient.send(new RollbackTransactionCommand({ ...dataApiConfig, transactionId }));
    const errorMsg = error instanceof Error ? error.message : "Unknown job error";
    await updateJobAction(jobId, { status: "failed", error: errorMsg, output: JSON.stringify({ executionId, results }) });
  }
}

// For the public view, get only approved tools
export async function getApprovedAssistantArchitectsAction(): Promise<
  ActionState<ArchitectWithRelations[]>
> {
  try {
    logger.info("Fetching approved Assistant Architects")
    
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // First, get all the tools the user has access to using data API
    const userTools = await executeSQL(`
      SELECT DISTINCT t.identifier
      FROM tools t
      JOIN role_tools rt ON t.id = rt.tool_id
      JOIN user_roles ur ON rt.role_id = ur.role_id
      JOIN users u ON ur.user_id = u.id
      WHERE u.cognito_sub = :cognitoSub AND t.is_active = true
    `, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
    
    if (userTools.length === 0) {
      return { isSuccess: true, message: "No assistants found", data: [] }
    }
    
    const toolIdentifiers = userTools.map(t => t.identifier);
    
    // Get the base tools from the tools table
    const baseTools = await executeSQL(`
      SELECT id, identifier, assistant_architect_id
      FROM tools
      WHERE identifier = ANY(:identifiers) AND is_active = true
    `, [{ name: 'identifiers', value: { stringValue: `{${toolIdentifiers.join(',')}}` } }]);
    
    // Extract assistant architect IDs
    const architectIds = baseTools
      .map(tool => tool.assistant_architect_id)
      .filter((id): id is string => id !== null)
    
    if (architectIds.length === 0) {
      return { isSuccess: true, message: "No assistants found", data: [] }
    }
    
    // Fetch approved architects that the user has access to
    const approvedArchitects = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE status = 'approved' AND id = ANY(:architectIds)
      ORDER BY created_at DESC
    `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }]);

    if (approvedArchitects.length === 0) {
      return { isSuccess: true, message: "No approved architects found", data: [] };
    }
    
    // Fetch related fields and prompts for all approved architects
    const [allInputFields, allPrompts] = await Promise.all([
      executeSQL(`
        SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE assistant_architect_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }]),
      executeSQL(`
        SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
        FROM chain_prompts
        WHERE assistant_architect_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }])
    ]);

    // Map relations back
    const results: ArchitectWithRelations[] = approvedArchitects.map((architect: any) => ({
      ...architect,
      inputFields: allInputFields.filter((f: any) => f.assistant_architect_id === architect.id) || [],
      prompts: allPrompts.filter((p: any) => p.assistant_architect_id === architect.id) || []
    }));

    return {
      isSuccess: true,
      message: "Approved Assistant Architects retrieved successfully",
      data: results
    }
  } catch (error) {
    logger.error("Error getting approved Assistant Architects:", error)
    return { isSuccess: false, message: "Failed to get approved Assistant Architects" }
  }
}

export async function submitAssistantArchitectForApprovalAction(
  id: string
): Promise<ActionState<void>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const toolResult = await executeSQL(`
      SELECT id, name, description, user_id, status
      FROM assistant_architects
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Assistant not found" }
    }

    const tool = toolResult[0];
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isSuccess: false, message: "User not found" }
    }
    if (tool.user_id !== currentUserId && !isAdmin) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Fetch input fields and prompts for this tool
    const [inputFields, prompts] = await Promise.all([
      executeSQL(`
        SELECT id FROM tool_input_fields WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]),
      executeSQL(`
        SELECT id FROM chain_prompts WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }])
    ]);

    if (!tool.name || !tool.description || inputFields.length === 0 || prompts.length === 0) {
      return { isSuccess: false, message: "Assistant is incomplete" }
    }

    await executeSQL(`
      UPDATE assistant_architects
      SET status = 'pending_approval'::tool_status, updated_at = NOW()
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    return {
      isSuccess: true,
      message: "Assistant submitted for approval",
      data: undefined
    }
  } catch (error) {
    logger.error("Error submitting assistant for approval:", error)
    return { isSuccess: false, message: "Failed to submit assistant" }
  }
}

// Action to get execution status and results
export async function getExecutionResultsAction(
  executionId: string
): Promise<ActionState<ExecutionResultDetails>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      throw createError("Unauthorized", {
        code: "UNAUTHORIZED",
        level: ErrorLevel.WARN
      });
    }
    
    // Get execution details
    const executionResult = await executeSQL(`
      SELECT te.id, te.assistant_architect_id, te.user_id, te.input_data, te.status, te.started_at, te.completed_at, te.created_at, te.updated_at
      FROM tool_executions te
      JOIN users u ON te.user_id = u.id
      WHERE te.id = :executionId AND u.cognito_sub = :cognitoSub
    `, [
      { name: 'executionId', value: { longValue: parseInt(executionId, 10) } },
      { name: 'cognitoSub', value: { stringValue: session.sub } }
    ]);
    
    if (!executionResult || executionResult.length === 0) {
      throw createError("Execution not found or access denied", {
        code: "NOT_FOUND",
        level: ErrorLevel.WARN,
        details: { executionId }
      });
    }

    const execution = executionResult[0];

    // Get prompt results for this execution
    const promptResultsData = await executeSQL(`
      SELECT id, execution_id, prompt_id, input_data, output_data, status, error_message, started_at, completed_at, execution_time_ms
      FROM prompt_results
      WHERE execution_id = :executionId
      ORDER BY started_at ASC
    `, [{ name: 'executionId', value: { longValue: parseInt(executionId, 10) } }]);

    // Return data in the ExecutionResultDetails format
    const returnData: ExecutionResultDetails = {
        ...execution,
        promptResults: promptResultsData || []
    };

    return createSuccess(returnData, "Execution status retrieved");
  } catch (error) {
    return handleError(error, "Failed to get execution results", {
      context: "getExecutionResultsAction"
    });
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
    logger.error("Error migrating prompt chains to assistant architect:", error)
    return { 
      isSuccess: false, 
      message: "Failed to migrate prompt chains to assistant architect"
    }
  }
}

export async function getToolsAction(): Promise<ActionState<SelectTool[]>> {
  try {
    const tools = await executeSQL(`
      SELECT id, identifier, name, description, assistant_architect_id, is_active, created_at, updated_at
      FROM tools
      WHERE is_active = true
      ORDER BY name ASC
    `);
    
    return {
      isSuccess: true,
      message: "Tools retrieved successfully",
      data: tools
    }
  } catch (error) {
    logger.error("Error getting tools:", error)
    return { isSuccess: false, message: "Failed to get tools" }
  }
}

export async function getAiModelsAction(): Promise<ActionState<SelectAiModel[]>> {
  try {
    const aiModels = await executeSQL(`
      SELECT id, name, provider, model_id, description, capabilities, max_tokens, active, chat_enabled, created_at, updated_at
      FROM ai_models
      ORDER BY name ASC
    `);
    
    return {
      isSuccess: true,
      message: "AI models retrieved successfully",
      data: aiModels
    }
  } catch (error) {
    logger.error("Error getting AI models:", error)
    return { isSuccess: false, message: "Failed to get AI models" }
  }
}

export async function setPromptPositionsAction(
  toolId: string,
  positions: { id: string; position: number }[]
): Promise<ActionState<void>> {
  try {
    const { userId } = await getServerSession();
    if (!userId) return { isSuccess: false, message: "Unauthorized" }

    // Verify permissions
    const toolResult = await executeSQL(
      `SELECT * FROM assistant_architects WHERE id = :id`,
      [{ name: 'id', value: { longValue: parseInt(toolId, 10) } }]
    )

    if (!toolResult.records || toolResult.records.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult.records[0]
    const toolUserId = tool[5]?.stringValue // userId is at index 5

    const isAdmin = await hasRole("administrator")
    if (!isAdmin && toolUserId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update positions for each prompt
    for (const { id, position } of positions) {
      await executeSQL(
        `UPDATE chain_prompts SET position = :position WHERE id = :id`,
        [
          { name: 'position', value: { longValue: position } },
          { name: 'id', value: { longValue: parseInt(id, 10) } }
        ]
      )
    }

    return { isSuccess: true, message: "Prompt positions updated", data: undefined }
  } catch (error) {
    logger.error("Error setting prompt positions:", error)
    return { isSuccess: false, message: "Failed to set prompt positions" }
  }
}

export async function getApprovedAssistantArchitectsForAdminAction(): Promise<
  ActionState<SelectAssistantArchitect[]>
> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      return { isSuccess: false, message: "User not found" }
    }

    // Check if user is an administrator
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view approved tools" }
    }

    // Get all approved tools
    const toolsResult = await executeSQL(
      `SELECT * FROM assistant_architects WHERE status = :status`,
      [{ name: 'status', value: { stringValue: 'approved' } }]
    )

    if (!toolsResult.records || toolsResult.records.length === 0) {
      return {
        isSuccess: true,
        message: "No approved tools found",
        data: []
      }
    }

    // Get related data for each tool
    const toolsWithRelations = await Promise.all(
      toolsResult.records.map(async (toolRecord) => {
        const toolId = toolRecord[0]?.stringValue || ''
        
        // Run input fields and prompts queries in parallel
        const [inputFieldsResult, promptsResult] = await Promise.all([
          executeSQL(
            `SELECT * FROM tool_input_fields WHERE assistant_architect_id = :toolId ORDER BY position ASC`,
            [{ name: 'toolId', value: { longValue: parseInt(toolId, 10) } }]
          ),
          executeSQL(
            `SELECT * FROM chain_prompts WHERE assistant_architect_id = :toolId ORDER BY position ASC`,
            [{ name: 'toolId', value: { longValue: parseInt(toolId, 10) } }]
          )
        ]);

        // Map the tool record
        const tool: SelectAssistantArchitect = {
          id: toolRecord[0]?.stringValue || '',
          name: toolRecord[1]?.stringValue || '',
          description: toolRecord[2]?.stringValue || null,
          status: toolRecord[3]?.stringValue || 'draft',
          imagePath: toolRecord[4]?.stringValue || null,
          userId: toolRecord[5]?.stringValue || '',
          createdAt: new Date(toolRecord[6]?.stringValue || ''),
          updatedAt: new Date(toolRecord[7]?.stringValue || '')
        }

        // Map input fields
        const inputFields = inputFieldsResult.records?.map(record => ({
          id: record[0]?.stringValue || '',
          toolId: record[1]?.stringValue || '',
          name: record[2]?.stringValue || '',
          label: record[3]?.stringValue || '',
          type: record[4]?.stringValue || 'text',
          placeholder: record[5]?.stringValue || null,
          description: record[6]?.stringValue || null,
          required: record[7]?.booleanValue || false,
          defaultValue: record[8]?.stringValue || null,
          position: Number(record[9]?.longValue || 0),
          createdAt: new Date(record[10]?.stringValue || ''),
          updatedAt: new Date(record[11]?.stringValue || '')
        })) || []

        // Map prompts
        const prompts = promptsResult.records?.map(record => ({
          id: record[0]?.stringValue || '',
          toolId: record[1]?.stringValue || '',
          name: record[2]?.stringValue || '',
          content: record[3]?.stringValue || '',
          systemContext: record[4]?.stringValue || null,
          userContext: record[5]?.stringValue || null,
          position: Number(record[6]?.longValue || 0),
          selectedModelId: record[7]?.stringValue || null,
          createdAt: new Date(record[8]?.stringValue || ''),
          updatedAt: new Date(record[9]?.stringValue || '')
        })) || []

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
    logger.error("Error getting approved Assistant Architects:", error);
    return { isSuccess: false, message: "Failed to get approved Assistant Architects" };
  }
}

export async function getAllAssistantArchitectsForAdminAction(): Promise<ActionState<ArchitectWithRelations[]>> {
  try {
    const session = await getServerSession();
    if (!session) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view all assistants" }
    }
    // Get all assistants
    const allAssistants = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      ORDER BY created_at DESC
    `);
    
    // Get related data for each assistant
    const assistantsWithRelations = await Promise.all(
      allAssistants.map(async (tool) => {
        const [inputFields, prompts] = await Promise.all([
          executeSQL(`
            SELECT * FROM tool_input_fields 
            WHERE assistant_architect_id = :toolId 
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }]),
          executeSQL(`
            SELECT * FROM chain_prompts 
            WHERE assistant_architect_id = :toolId 
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }])
        ])
        return { ...tool, inputFields, prompts }
      })
    )
    return { isSuccess: true, message: "All assistants retrieved successfully", data: assistantsWithRelations }
  } catch (error) {
    logger.error("Error getting all assistants for admin:", error)
    return { isSuccess: false, message: "Failed to get all assistants" }
  }
}