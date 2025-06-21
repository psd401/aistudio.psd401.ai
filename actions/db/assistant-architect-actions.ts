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
  jobStatusEnum,
  navigationItemsTable
} from "@/db/schema"
import { desc, eq, and, asc, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { CoreMessage } from "ai"

import { createJobAction, updateJobAction } from "@/actions/db/jobs-actions";
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
  assistant: InsertAssistantArchitect
): Promise<ActionState<SelectAssistantArchitect>> {
  try {
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" };
    }

    const [architect] = await executeSQL(`
      INSERT INTO assistant_architects (id, name, description, status, image_path, user_id, created_at, updated_at)
      VALUES (:id, :name, :description, :status, :imagePath, :userId, NOW(), NOW())
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [
      { name: 'id', value: { stringValue: uuidv4() } },
      { name: 'name', value: { stringValue: assistant.name } },
      { name: 'description', value: { stringValue: assistant.description } },
      { name: 'status', value: { stringValue: assistant.status } },
      { name: 'imagePath', value: { stringValue: assistant.imagePath } },
      { name: 'userId', value: { stringValue: session.sub } }
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
            SELECT id, tool_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE tool_id = :toolId::uuid
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { stringValue: architect.id } }]),
          executeSQL(`
            SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
            FROM chain_prompts
            WHERE tool_id = :toolId::uuid
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { stringValue: architect.id } }])
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
    const architectResult = await executeSQL(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

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
        SELECT id, tool_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE tool_id = :toolId::uuid
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { stringValue: id } }]),
      executeSQL(`
        SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
        FROM chain_prompts
        WHERE tool_id = :toolId::uuid
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { stringValue: id } }])
    ]);

    // Transform snake_case to camelCase for frontend compatibility
    const transformedInputFields = (inputFields || []).map((field: any) => ({
      id: field.id,
      toolId: field.tool_id,
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
      toolId: prompt.tool_id,
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
      pendingTools.map(async (tool) => {
        const [inputFields, prompts] = await Promise.all([
          executeSQL(`
            SELECT id, tool_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE tool_id = :toolId::uuid
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { stringValue: tool.id } }]),
          executeSQL(`
            SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
            FROM chain_prompts
            WHERE tool_id = :toolId::uuid
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { stringValue: tool.id } }])
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
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);
    
    if (!currentToolResult || currentToolResult.length === 0) {
      return { isSuccess: false, message: "Assistant not found" }
    }
    
    const currentTool = currentToolResult[0];
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    const isCreator = currentTool.user_id === session.userId
    if (!isAdmin && !isCreator) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // If the tool was approved and is being edited, set status to pending_approval and deactivate it in the tools table
    if (currentTool.status === "approved") {
      data.status = "pending_approval"
      await executeSQL(`
        UPDATE tools 
        SET is_active = false 
        WHERE assistant_architect_id = :id::uuid
      `, [{ name: 'id', value: { stringValue: id } }]);
    }
    
    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { stringValue: id } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'imagePath' ? 'image_path' : key === 'userId' ? 'user_id' : key;
        updateFields.push(`${snakeKey} = :param${paramIndex}`);
        parameters.push({ 
          name: `param${paramIndex}`, 
          value: value === null ? { isNull: true } : { stringValue: String(value) }
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
      WHERE id = :id::uuid
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
    await executeSQL(`
      DELETE FROM assistant_architects
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

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
      INSERT INTO tool_input_fields (id, tool_id, name, label, field_type, position, options, created_at, updated_at)
      VALUES (gen_random_uuid(), :toolId::uuid, :name, :label, :fieldType::field_type, :position, :options, NOW(), NOW())
    `, [
      { name: 'toolId', value: { stringValue: architectId } },
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
      SELECT id, tool_id
      FROM tool_input_fields
      WHERE id = :fieldId::uuid
    `, [{ name: 'fieldId', value: { stringValue: fieldId } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Check if user is the creator of the tool
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId::uuid
    `, [{ name: 'toolId', value: { stringValue: field.tool_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Check permissions
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin && tool.user_id !== session.userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the field
    await executeSQL(`
      DELETE FROM tool_input_fields
      WHERE id = :fieldId::uuid
    `, [{ name: 'fieldId', value: { stringValue: fieldId } }]);

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
      SELECT id, tool_id, name, label, field_type, position, options, created_at, updated_at
      FROM tool_input_fields
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId::uuid
    `, [{ name: 'toolId', value: { stringValue: field.tool_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can update fields
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin && tool.user_id !== session.userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { stringValue: id } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'fieldType' ? 'field_type' : key === 'toolId' ? 'tool_id' : key;
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
      WHERE id = :id::uuid
      RETURNING id, tool_id, name, label, field_type, position, options, created_at, updated_at
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
      WHERE id = :toolId::uuid
    `, [{ name: 'toolId', value: { stringValue: toolId } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can reorder fields
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin && tool.user_id !== session.userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update each field's position
    const updatedFields = await Promise.all(
      fieldOrders.map(async ({ id, position }) => {
        const result = await executeSQL(`
          UPDATE tool_input_fields
          SET position = :position, updated_at = NOW()
          WHERE id = :id::uuid
          RETURNING id, tool_id, name, label, field_type, position, options, created_at, updated_at
        `, [
          { name: 'position', value: { longValue: position } },
          { name: 'id', value: { stringValue: id } }
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
      INSERT INTO chain_prompts (id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at)
      VALUES (gen_random_uuid(), :toolId::uuid, :name, :content, :systemContext, :modelId, :position, :inputMapping, NOW(), NOW())
    `, [
      { name: 'toolId', value: { stringValue: architectId } },
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
      SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
      FROM chain_prompts
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId::uuid
    `, [{ name: 'toolId', value: { stringValue: prompt.tool_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can update prompts
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin && tool.user_id !== session.userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Build update query dynamically
    const updateFields = [];
    const parameters = [{ name: 'id', value: { stringValue: id } }];
    let paramIndex = 0;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const snakeKey = key === 'toolId' ? 'tool_id' : 
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
      WHERE id = :id::uuid
      RETURNING id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
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
      SELECT tool_id
      FROM chain_prompts
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId::uuid
    `, [{ name: 'toolId', value: { stringValue: prompt.tool_id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0];

    // Only tool creator or admin can delete prompts
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin && tool.user_id !== session.userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the prompt
    await executeSQL(`
      DELETE FROM chain_prompts
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

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
    const { userId } = await getServerSession();
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
    if (!isAdmin && tool.userId !== userId) {
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
    logger.error("Error updating prompt position:", error)
    return { isSuccess: false, message: "Failed to update prompt position" }
  }
}

// Tool Execution Actions

export async function createToolExecutionAction(
  execution: InsertToolExecution
): Promise<ActionState<string>> {
  try {
    const { userId } = await getServerSession();
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
    logger.error("Error creating tool execution:", error)
    return { isSuccess: false, message: "Failed to create tool execution" }
  }
}

export async function updatePromptResultAction(
  executionId: string,
  promptId: string,
  result: Partial<InsertPromptResult>
): Promise<ActionState<void>> {
  try {
    const { userId } = await getServerSession();
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
      SET status = 'approved', updated_at = NOW()
      WHERE id = :id::uuid
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [{ name: 'id', value: { stringValue: id } }]);
    
    if (!updatedToolResult || updatedToolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }
    
    const updatedTool = updatedToolResult[0];
    
    // Check if tool already exists in tools table
    const existingToolResult = await executeSQL(`
      SELECT id FROM tools WHERE assistant_architect_id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);
    
    let identifier = generateToolIdentifier(updatedTool.name);
    let finalToolId: string;
    
    if (existingToolResult && existingToolResult.length > 0) {
      // Update existing tool
      await executeSQL(`
        UPDATE tools
        SET identifier = :identifier, name = :name, description = :description, is_active = true, updated_at = NOW()
        WHERE assistant_architect_id = :id::uuid
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description } },
        { name: 'id', value: { stringValue: id } }
      ]);
      finalToolId = existingToolResult[0].id;
    } else {
      // Check for duplicate identifier
      const duplicateResult = await executeSQL(`
        SELECT id FROM tools WHERE identifier = :identifier
      `, [{ name: 'identifier', value: { stringValue: identifier } }]);
      
      if (duplicateResult && duplicateResult.length > 0) {
        identifier = `${identifier}-${uuidv4().slice(0, 8)}`;
      }
      
      // Create new tool
      const newToolResult = await executeSQL(`
        INSERT INTO tools (id, identifier, name, description, is_active, assistant_architect_id, created_at, updated_at)
        VALUES (:identifier, :identifier, :name, :description, true, :assistantArchitectId::uuid, NOW(), NOW())
        RETURNING id
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description } },
        { name: 'assistantArchitectId', value: { stringValue: id } }
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
      SET status = 'rejected', updated_at = NOW()
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

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
  promptId: string;
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
  toolId: string
  inputs: Record<string, unknown>
}): Promise<ActionState<{ jobId: string }>> {
  logger.info(`[EXEC] Started for tool ${toolId}`);
  
  try {
    const { userId } = await getServerSession();
    if (!userId) {
      throw createError("Unauthorized", {
        code: "UNAUTHORIZED",
        level: ErrorLevel.WARN
      });
    }

    // First get the tool to check if it exists and user has access
    const toolResult = await getAssistantArchitectByIdAction(toolId)
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
      userId
    });

    if (!jobResult.isSuccess) {
      throw createError("Failed to create execution job", {
        code: "INTERNAL_ERROR",
        level: ErrorLevel.ERROR,
        details: { toolId }
      });
    }

    // Start the execution in the background
    executeAssistantArchitectJob(jobResult.data.id, tool, inputs).catch(error => {
      logger.error(`[EXEC:${jobResult.data.id}] Background execution failed:`, error);
    });

    return createSuccess({ jobId: jobResult.data.id }, "Execution started");
  } catch (error) {
    return handleError(error, "Failed to execute assistant architect", {
      context: "executeAssistantArchitectAction"
    });
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
        userId: tool.userId,
        inputData: inputs,
        status: "running",
        startedAt: executionStartTime
      }).returning();
      execution = insertedExecution;
      logger.info(`[EXEC:${jobId}] Created execution ${execution.id}`);

      const prompts = tool.prompts?.sort((a: SelectChainPrompt, b: SelectChainPrompt) => (a.position ?? 0) - (b.position ?? 0)) || [];

      for (const [index, prompt] of prompts.entries()) {
        let promptResultRecord: SelectPromptResult | null = null;
        const promptStartTime = new Date();
        const promptInputData: Record<string, unknown> = { ...inputs };
        // Add previous prompt outputs as variables using slugified names
        for (let prevIdx = 0; prevIdx < index; prevIdx++) {
          const prevPrompt = prompts[prevIdx];
          const prevResult = results.find(r => r.promptId === prevPrompt.id);
          if (prevResult && prevResult.output !== undefined) {
            promptInputData[slugify(prevPrompt.name)] = prevResult.output;
          }
        }
        logger.info(`[EXEC:${jobId}] Processing prompt ${index+1}/${prompts.length}: ${prompt.name}`);

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
                const fieldId = value.replace('input.', '');
                // Try to find by ID first (for preview), then by name (for compatibility)
                const inputFieldDef = tool.inputFields?.find(
                  (f: SelectToolInputField) => f.id === fieldId || f.name === fieldId
                );
                if (inputFieldDef) {
                  // Only map if we haven't already mapped this input field
                  if (!promptInputData[key]) {
                    promptInputData[key] = inputs[inputFieldDef.name];
                  }
                } else {
                  promptInputData[key] = `[Mapping error: Input field '${fieldId}' not found]`;
                }
              } else if (value.startsWith('prompt.')) {
                // New: handle prompt.<id> mapping to previous prompt output
                const promptId = value.replace('prompt.', '');
                const previousResult = results.find((r: PromptExecutionResult) => r.promptId === promptId);
                promptInputData[key] = previousResult?.output ?? `[Mapping error: Result from prompt '${promptId}' not found]`;
              } else {
                // Legacy: treat as direct prompt id (for backward compatibility)
                const previousResult = results.find((r: PromptExecutionResult) => r.promptId === value);
                promptInputData[key] = previousResult?.output ?? `[Mapping error: Result from prompt '${value}' not found]`;
              }
            }
          }

          // Execute the prompt
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

          logger.info(`[EXEC:${jobId}] Completed prompt ${index+1}/${prompts.length}: ${prompt.name}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          logger.error(`[EXEC:${jobId}] Error processing prompt ${index+1}: ${errorMsg}`);
          
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
    logger.error(`[EXEC:${jobId}] Execution failed:`, errorMsg);

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
        SELECT id, tool_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE tool_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }]),
      executeSQL(`
        SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
        FROM chain_prompts
        WHERE tool_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }])
    ]);

    // Map relations back
    const results: ArchitectWithRelations[] = approvedArchitects.map((architect: any) => ({
      ...architect,
      inputFields: allInputFields.filter((f: any) => f.tool_id === architect.id) || [],
      prompts: allPrompts.filter((p: any) => p.tool_id === architect.id) || []
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
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Assistant not found" }
    }

    const tool = toolResult[0];
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (tool.user_id !== session.userId && !isAdmin) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    // Fetch input fields and prompts for this tool
    const [inputFields, prompts] = await Promise.all([
      executeSQL(`
        SELECT id FROM tool_input_fields WHERE tool_id = :id::uuid
      `, [{ name: 'id', value: { stringValue: id } }]),
      executeSQL(`
        SELECT id FROM chain_prompts WHERE tool_id = :id::uuid
      `, [{ name: 'id', value: { stringValue: id } }])
    ]);

    if (!tool.name || !tool.description || inputFields.length === 0 || prompts.length === 0) {
      return { isSuccess: false, message: "Assistant is incomplete" }
    }

    await executeSQL(`
      UPDATE assistant_architects
      SET status = 'pending_approval', updated_at = NOW()
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: id } }]);

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
      SELECT te.id, te.tool_id, te.user_id, te.input_data, te.status, te.started_at, te.completed_at, te.created_at, te.updated_at
      FROM tool_executions te
      JOIN users u ON te.user_id = u.id
      WHERE te.id = :executionId::uuid AND u.cognito_sub = :cognitoSub
    `, [
      { name: 'executionId', value: { stringValue: executionId } },
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
      WHERE execution_id = :executionId::uuid
      ORDER BY started_at ASC
    `, [{ name: 'executionId', value: { stringValue: executionId } }]);

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
    const [tool] = await db
      .select()
      .from(assistantArchitectsTable)
      .where(eq(assistantArchitectsTable.id, toolId))

    if (!tool) return { isSuccess: false, message: "Tool not found" }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin && tool.userId !== userId) {
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
    logger.error("Error setting prompt positions:", error)
    return { isSuccess: false, message: "Failed to set prompt positions" }
  }
}

export async function getApprovedAssistantArchitectsForAdminAction(): Promise<
  ActionState<SelectAssistantArchitect[]>
> {
  try {
    const { userId } = await getServerSession();
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
        // Run input fields and prompts queries in parallel
        const [inputFields, prompts] = await Promise.all([
          db
            .select()
            .from(toolInputFieldsTable)
            .where(eq(toolInputFieldsTable.toolId, tool.id))
            .orderBy(asc(toolInputFieldsTable.position)),
            
          db
            .select()
            .from(chainPromptsTable)
            .where(eq(chainPromptsTable.toolId, tool.id))
            .orderBy(asc(chainPromptsTable.position))
        ]);

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
    const { userId } = await getServerSession();
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view all assistants" }
    }
    // Get all assistants
    const allAssistants = await db.select().from(assistantArchitectsTable)
    // Get related data for each assistant
    const assistantsWithRelations = await Promise.all(
      allAssistants.map(async (tool) => {
        const [inputFields, prompts] = await Promise.all([
          db.select().from(toolInputFieldsTable).where(eq(toolInputFieldsTable.toolId, tool.id)).orderBy(asc(toolInputFieldsTable.position)),
          db.select().from(chainPromptsTable).where(eq(chainPromptsTable.toolId, tool.id)).orderBy(asc(chainPromptsTable.position))
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