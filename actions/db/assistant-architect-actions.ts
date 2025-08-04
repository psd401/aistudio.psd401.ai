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
import { transformSnakeToCamel } from '@/lib/db/field-mapper'

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
import { executeSQL, checkUserRoleByCognitoSub, hasToolAccess, type FormattedRow } from "@/lib/db/data-api-adapter";
import { getCurrentUserAction } from "@/actions/db/get-current-user-action";
import { RDSDataClient, BeginTransactionCommand, ExecuteStatementCommand, CommitTransactionCommand, RollbackTransactionCommand, SqlParameter } from "@aws-sdk/client-rds-data";

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

    const [architectRaw] = await executeSQL<any>(`
      INSERT INTO assistant_architects (name, description, status, image_path, user_id, created_at, updated_at)
      VALUES (:name, :description, :status::tool_status, :imagePath, :userId, NOW(), NOW())
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [
      { name: 'name', value: { stringValue: assistant.name } },
      { name: 'description', value: { stringValue: assistant.description || '' } },
      { name: 'status', value: { stringValue: assistant.status || 'draft' } },
      { name: 'imagePath', value: assistant.imagePath ? { stringValue: assistant.imagePath } : { isNull: true } },
      { name: 'userId', value: { longValue: currentUser.data.user.id } }
    ]);

    const architect = transformSnakeToCamel<SelectAssistantArchitect>(architectRaw);

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
    const architectsRaw = await executeSQL<any>(`
      SELECT a.id, a.name, a.description, a.status, a.image_path, a.user_id, a.created_at, a.updated_at,
             u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email,
             u.cognito_sub
      FROM assistant_architects a
      LEFT JOIN users u ON a.user_id = u.id
    `);

    const architectsWithRelations = await Promise.all(
      architectsRaw.map(async (architect: any) => {
        const [inputFieldsRaw, promptsRaw] = await Promise.all([
          executeSQL<any>(`
            SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: architect.id } }]),
          executeSQL<any>(`
            SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, repository_ids, created_at, updated_at
            FROM chain_prompts
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: architect.id } }])
        ]);

        const inputFields = inputFieldsRaw.map((field: any) => transformSnakeToCamel<SelectToolInputField>(field));
        const prompts = promptsRaw.map((prompt: any) => {
          const transformed = transformSnakeToCamel<SelectChainPrompt>(prompt);
          // Parse repository_ids if it's a JSON string
          if (typeof transformed.repositoryIds === 'string') {
            try {
              transformed.repositoryIds = JSON.parse(transformed.repositoryIds);
            } catch (e) {
              logger.error('Failed to parse repository_ids:', e);
              transformed.repositoryIds = [];
            }
          }
          return transformed;
        });
        const transformedArchitect = transformSnakeToCamel<SelectAssistantArchitect>(architect);

        return {
          ...transformedArchitect,
          inputFields,
          prompts,
          creator: architect.creator_first_name && architect.creator_last_name && architect.creator_email
            ? {
                firstName: architect.creator_first_name,
                lastName: architect.creator_last_name,
                email: architect.creator_email
              }
            : null,
          cognito_sub: architect.cognito_sub
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

    const architectResult = await executeSQL<any>(`
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

    const architect = transformSnakeToCamel<SelectAssistantArchitect>(architectResult[0]);
    
    // Get input fields and prompts using data API
    const [inputFieldsRaw, promptsRaw] = await Promise.all([
      executeSQL<any>(`
        SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE assistant_architect_id = :toolId
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { longValue: idInt } }]),
      executeSQL<any>(`
        SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, repository_ids, created_at, updated_at
        FROM chain_prompts
        WHERE assistant_architect_id = :toolId
        ORDER BY position ASC
      `, [{ name: 'toolId', value: { longValue: idInt } }])
    ]);

    // Transform snake_case to camelCase for frontend compatibility
    const transformedInputFields = (inputFieldsRaw || []).map((field: any) => transformSnakeToCamel<SelectToolInputField>(field));
    const transformedPrompts = (promptsRaw || []).map((prompt: any) => {
      const transformed = transformSnakeToCamel<SelectChainPrompt>(prompt);
      // Parse repository_ids if it's a JSON string
      if (typeof transformed.repositoryIds === 'string') {
        try {
          transformed.repositoryIds = JSON.parse(transformed.repositoryIds);
        } catch (e) {
          logger.error('Failed to parse repository_ids:', e);
          transformed.repositoryIds = [];
        }
      }
      return transformed;
    });

    const architectWithRelations: ArchitectWithRelations = {
      ...architect,
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
    const pendingTools = await executeSQL<any>(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE status = 'pending_approval'
      ORDER BY created_at DESC
    `);

    // For each tool, get its input fields and prompts
    const toolsWithRelations = await Promise.all(
      pendingTools.map(async (tool: any) => {
        const [inputFieldsRaw, promptsRaw] = await Promise.all([
          executeSQL<any>(`
            SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
            FROM tool_input_fields
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }]),
          executeSQL<any>(`
            SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, repository_ids, created_at, updated_at
            FROM chain_prompts
            WHERE assistant_architect_id = :toolId
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }])
        ]);

        const transformedTool = transformSnakeToCamel<SelectAssistantArchitect>(tool);
        const inputFields = inputFieldsRaw.map((field: any) => transformSnakeToCamel<SelectToolInputField>(field));
        const prompts = promptsRaw.map((prompt: any) => {
          const transformed = transformSnakeToCamel<SelectChainPrompt>(prompt);
          // Parse repository_ids if it's a JSON string
          if (typeof transformed.repositoryIds === 'string') {
            try {
              transformed.repositoryIds = JSON.parse(transformed.repositoryIds);
            } catch (e) {
              logger.error('Failed to parse repository_ids:', e);
              transformed.repositoryIds = [];
            }
          }
          return transformed;
        });

        return {
          ...transformedTool,
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
    const currentToolResult = await executeSQL<any>(`
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
      await executeSQL<never>(`
        UPDATE tools 
        SET is_active = false 
        WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    }
    
    // Build update query dynamically
    const updateFields = [];
    const parameters: SqlParameter[] = [{ name: 'id', value: { longValue: parseInt(id, 10) } }];
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
    
    const updatedToolResult = await executeSQL<SelectAssistantArchitect>(`
      UPDATE assistant_architects 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, parameters);
    
    const updatedToolRaw = updatedToolResult[0];
    return {
      isSuccess: true,
      message: "Assistant updated successfully",
      data: transformSnakeToCamel<SelectAssistantArchitect>(updatedToolRaw)
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
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    // Check if user has admin access
    const hasAccess = await hasToolAccess(session.sub, "admin");
    if (!hasAccess) {
      return { isSuccess: false, message: "Access denied" }
    }
    
    // Delete from tools table (using prompt_chain_tool_id which references assistant_architect)
    await executeSQL<never>(`
      DELETE FROM tools
      WHERE prompt_chain_tool_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    // Delete from navigation_items
    await executeSQL<never>(`
      DELETE FROM navigation_items
      WHERE link = :link
    `, [{ name: 'link', value: { stringValue: `/tools/assistant-architect/${id}` } }]);
    
    // Use the deleteAssistantArchitect function which handles all the cascade deletes properly
    const { deleteAssistantArchitect } = await import("@/lib/db/data-api-adapter");
    await deleteAssistantArchitect(parseInt(id, 10));

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
    await executeSQL<never>(`
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
    const fieldResult = await executeSQL<any>(`
      SELECT id, assistant_architect_id
      FROM tool_input_fields
      WHERE id = :fieldId
    `, [{ name: 'fieldId', value: { longValue: parseInt(fieldId, 10) } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Check if user is the creator of the tool
    const toolResult = await executeSQL<any>(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: (field as any).assistant_architect_id || field.assistantArchitectId } }]);

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
    await executeSQL<never>(`
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
    const fieldResult = await executeSQL<SelectToolInputField>(`
      SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
      FROM tool_input_fields
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!fieldResult || fieldResult.length === 0) {
      return { isSuccess: false, message: "Input field not found" }
    }

    const field = fieldResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL<any>(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: (field as any).assistant_architect_id || field.assistantArchitectId } }]);

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
    const parameters: SqlParameter[] = [{ name: 'id', value: { longValue: parseInt(id, 10) } }];
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
          // Special handling for arrays and objects
          if (value === null) {
            paramValue = { isNull: true };
          } else if (Array.isArray(value)) {
            if (value.length === 0) {
              paramValue = { isNull: true };
            } else {
              // Make sure all array elements are defined
              const cleanArray = value.filter(v => v !== undefined);
              paramValue = { stringValue: JSON.stringify(cleanArray) };
            }
          } else {
            // For non-array objects, stringify them
            paramValue = { stringValue: JSON.stringify(value) };
          }
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
      parameters.push({ name: 'labelParam', value: { stringValue: String(data.name) } });
    }
    
    if (updateFields.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }

    const updatedFieldResult = await executeSQL<any>(`
      UPDATE tool_input_fields 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
    `, parameters);

    return {
      isSuccess: true,
      message: "Input field updated successfully",
      data: transformSnakeToCamel<SelectToolInputField>(updatedFieldResult[0])
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
    const toolResult = await executeSQL<any>(`
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
        const result = await executeSQL<any>(`
          UPDATE tool_input_fields
          SET position = :position, updated_at = NOW()
          WHERE id = :id
          RETURNING id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        `, [
          { name: 'position', value: { longValue: position } },
          { name: 'id', value: { longValue: parseInt(id, 10) } }
        ]);
        return transformSnakeToCamel<SelectToolInputField>(result[0]);
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
    repositoryIds?: number[]
  }
): Promise<ActionState<void>> {
  try {
    // If repository IDs are provided, validate user has access
    if (data.repositoryIds && data.repositoryIds.length > 0) {
      const session = await getServerSession();
      if (!session || !session.sub) {
        return { isSuccess: false, message: "Unauthorized" };
      }
      
      const hasAccess = await hasToolAccess(session.sub, "knowledge-repositories");
      if (!hasAccess) {
        return { isSuccess: false, message: "Access denied. You need knowledge repository access." };
      }
    }

    await executeSQL<never>(`
      INSERT INTO chain_prompts (assistant_architect_id, name, content, system_context, model_id, position, input_mapping, repository_ids, created_at, updated_at)
      VALUES (:toolId, :name, :content, :systemContext, :modelId, :position, :inputMapping::jsonb, :repositoryIds::jsonb, NOW(), NOW())
    `, [
      { name: 'toolId', value: { longValue: parseInt(architectId, 10) } },
      { name: 'name', value: { stringValue: data.name } },
      { name: 'content', value: { stringValue: data.content } },
      { name: 'systemContext', value: data.systemContext ? { stringValue: data.systemContext } : { isNull: true } },
      { name: 'modelId', value: { longValue: data.modelId } },
      { name: 'position', value: { longValue: data.position } },
      { name: 'inputMapping', value: data.inputMapping ? { stringValue: JSON.stringify(data.inputMapping) } : { isNull: true } },
      { name: 'repositoryIds', value: data.repositoryIds ? { stringValue: JSON.stringify(data.repositoryIds) } : { stringValue: '[]' } }
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
    const promptResult = await executeSQL<any>(`
      SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, parallel_group, timeout_seconds, repository_ids, created_at, updated_at
      FROM chain_prompts
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];
    
    
    // executeSQL converts snake_case to camelCase, so use assistantArchitectId
    const assistantArchitectId = prompt.assistantArchitectId;
    
    if (!assistantArchitectId) {
      return { isSuccess: false, message: "Invalid prompt - missing assistant architect reference" };
    }

    // Get the tool to check permissions
    const toolResult = await executeSQL<{ userId: number }>(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: assistantArchitectId } }]);

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
    if (!isAdmin && tool.userId !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // If repository IDs are being updated, validate user has access
    if (data.repositoryIds && data.repositoryIds.length > 0) {
      const hasAccess = await hasToolAccess(session.sub, "knowledge-repositories");
      if (!hasAccess) {
        return { isSuccess: false, message: "Access denied. You need knowledge repository access." };
      }
    }
    
    // Clean up data object - remove undefined or null repositoryIds
    // But keep empty arrays so they can be saved to clear the field
    if ('repositoryIds' in data) {
      if (data.repositoryIds === undefined || data.repositoryIds === null) {
        // Remove the key entirely if it's undefined or null
        delete data.repositoryIds;
      }
      // Keep empty arrays - they should be saved as '[]' in the database
    }

    // Build update query dynamically
    const updateFields = [];
    const parameters: SqlParameter[] = [];
    let paramIndex = 0;
    
    
    // Filter out undefined values before processing
    const definedEntries = Object.entries(data).filter(([_, value]) => value !== undefined);
    
    for (const [key, value] of definedEntries) {
        
        const snakeKey = key === 'toolId' ? 'assistant_architect_id' : 
                        key === 'systemContext' ? 'system_context' : 
                        key === 'modelId' ? 'model_id' : 
                        key === 'inputMapping' ? 'input_mapping' : 
                        key === 'repositoryIds' ? 'repository_ids' : key;
        
        // Add JSONB cast for JSON columns
        if (key === 'inputMapping' || key === 'repositoryIds') {
          updateFields.push(`${snakeKey} = :param${paramIndex}::jsonb`);
        } else {
          updateFields.push(`${snakeKey} = :param${paramIndex}`);
        }
        
        let paramValue;
        if (value === null) {
          paramValue = { isNull: true };
        } else if (typeof value === 'number') {
          paramValue = { longValue: value };
        } else if (typeof value === 'boolean') {
          paramValue = { booleanValue: value };
        } else if (typeof value === 'string') {
          // Ensure string is not empty
          paramValue = { stringValue: value || '' };
        } else if (typeof value === 'object') {
          // Special handling for arrays and objects
          if (Array.isArray(value)) {
            // Always stringify arrays, even empty ones
            // This ensures empty arrays are stored as '[]' not NULL
            const cleanArray = value.filter(v => v !== undefined);
            paramValue = { stringValue: JSON.stringify(cleanArray) };
          } else {
            // For non-array objects, stringify them
            paramValue = { stringValue: JSON.stringify(value) };
          }
        } else {
          paramValue = { stringValue: String(value) };
        }
        
        const param = { name: `param${paramIndex}`, value: paramValue };
        parameters.push(param);
        paramIndex++;
    }
    
    if (updateFields.length === 0) {
      return { isSuccess: false, message: "No fields to update" }
    }

    // Add the id parameter at the end
    parameters.push({ name: 'id', value: { longValue: parseInt(id, 10) } });
    

    const sql = `UPDATE chain_prompts SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = :id RETURNING id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, parallel_group, timeout_seconds, repository_ids, created_at, updated_at`;
    
    const updatedPromptResult = await executeSQL<any>(sql, parameters);

    return {
      isSuccess: true,
      message: "Prompt updated successfully",
      data: transformSnakeToCamel<SelectChainPrompt>(updatedPromptResult[0])
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
    const promptResult = await executeSQL<{ assistantArchitectId: number }>(`
      SELECT assistant_architect_id
      FROM chain_prompts
      WHERE id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0];

    // Get the tool to check permissions
    const toolResult = await executeSQL<{ userId: number }>(`
      SELECT user_id
      FROM assistant_architects
      WHERE id = :toolId
    `, [{ name: 'toolId', value: { longValue: prompt.assistantArchitectId } }]);

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
    if (!isAdmin && tool.userId !== currentUserId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Delete the prompt
    await executeSQL<never>(`
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
    const promptResult = await executeSQL<any>(
      `SELECT assistant_architect_id FROM chain_prompts WHERE id = :id`,
      [{ name: 'id', value: { longValue: parseInt(id, 10) } }]
    )

    if (!promptResult || promptResult.length === 0) {
      return { isSuccess: false, message: "Prompt not found" }
    }

    const prompt = promptResult[0] as any;
    const toolId = prompt.assistant_architect_id;

    // Get the tool to check permissions
    const toolResult = await executeSQL<any>(
      `SELECT user_id FROM assistant_architects WHERE id = :id`,
      [{ name: 'id', value: { longValue: toolId } }]
    )

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0] as any;
    const toolUserId = tool.user_id;

    // Only tool creator or admin can update prompt positions
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator");
    if (!isAdmin && toolUserId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update the prompt's position
    await executeSQL<never>(
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

    const [executionResult] = await executeSQL<{ id: string }>(
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
    
    const executionId = (executionResult as any)[0].id as number

    return {
      isSuccess: true,
      message: "Tool execution created successfully",
      data: executionId.toString()
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
      { name: 'promptId', value: { longValue: promptId } }
    )

    await executeSQL<never>(
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
    const updatedToolResult = await executeSQL<any>(`
      UPDATE assistant_architects
      SET status = 'approved'::tool_status, updated_at = NOW()
      WHERE id = :id
      RETURNING id, name, description, status, image_path, user_id, created_at, updated_at
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    if (!updatedToolResult || updatedToolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }
    
    const updatedTool = transformSnakeToCamel<SelectAssistantArchitect>(updatedToolResult[0]);
    
    // Check if tool already exists in tools table
    const existingToolResult = await executeSQL<{ id: string }>(`
      SELECT id FROM tools WHERE assistant_architect_id = :id
    `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]);
    
    let identifier = generateToolIdentifier(updatedTool.name);
    let finalToolId: string;
    
    if (existingToolResult && existingToolResult.length > 0) {
      // Update existing tool
      await executeSQL<never>(`
        UPDATE tools
        SET identifier = :identifier, name = :name, description = :description, is_active = true, updated_at = NOW()
        WHERE assistant_architect_id = :id
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description || '' } },
        { name: 'id', value: { longValue: parseInt(id, 10) } }
      ]);
      finalToolId = existingToolResult[0].id as string;
    } else {
      // Check for duplicate identifier
      const duplicateResult = await executeSQL<{ id: string }>(`
        SELECT id FROM tools WHERE identifier = :identifier
      `, [{ name: 'identifier', value: { stringValue: identifier } }]);
      
      if (duplicateResult && duplicateResult.length > 0) {
        identifier = `${identifier}-${Date.now()}`;
      }
      
      // Create new tool
      const newToolResult = await executeSQL<{ id: string }>(`
        INSERT INTO tools (id, identifier, name, description, is_active, assistant_architect_id, created_at, updated_at)
        VALUES (:identifier, :identifier, :name, :description, true, :assistantArchitectId, NOW(), NOW())
        RETURNING id
      `, [
        { name: 'identifier', value: { stringValue: identifier } },
        { name: 'name', value: { stringValue: updatedTool.name } },
        { name: 'description', value: { stringValue: updatedTool.description || '' } },
        { name: 'assistantArchitectId', value: { longValue: parseInt(id, 10) } }
      ]);
      finalToolId = newToolResult[0].id as string;
    }
    
    // Create navigation item if it doesn't exist
    const navLink = `/tools/assistant-architect/${id}`;
    const existingNavResult = await executeSQL<{ id: string }>(`
      SELECT id FROM navigation_items WHERE parent_id = 'experiments' AND link = :link
    `, [{ name: 'link', value: { stringValue: navLink } }]);
    
    if (!existingNavResult || existingNavResult.length === 0) {
      let baseNavId = generateToolIdentifier(updatedTool.name);
      let navId = baseNavId;
      let navSuffix = 2;
      
      // Check for unique navigation ID
      let navExists = true;
      while (navExists) {
        const navCheckResult = await executeSQL<{ id: string }>(`
          SELECT id FROM navigation_items WHERE id = :navId
        `, [{ name: 'navId', value: { stringValue: navId } }]);
        
        if (!navCheckResult || navCheckResult.length === 0) {
          navExists = false;
        } else {
          navId = `${baseNavId}-${navSuffix++}`;
        }
      }
      
      await executeSQL<never>(`
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
    const rolesResult = await executeSQL<{ id: string; name: string }>(`
      SELECT id, name FROM roles WHERE name IN ('staff', 'administrator')
    `);
    
    for (const role of rolesResult) {
      // Check if assignment already exists
      const existingAssignmentResult = await executeSQL<{ '?column?': number }>(`
        SELECT 1 FROM role_tools WHERE role_id = :roleId AND tool_id = :toolId
      `, [
        { name: 'roleId', value: { stringValue: role.id } },
        { name: 'toolId', value: { stringValue: finalToolId } }
      ]);
      
      if (!existingAssignmentResult || existingAssignmentResult.length === 0) {
        await executeSQL<never>(`
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

    await executeSQL<never>(`
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
    const executionResult = await executeSQL<{ id: number }>(
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

    const executionId = executionResult[0]?.id as number;

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
          { name: 'toolId', value: { longValue: typeof tool.id === 'string' ? parseInt(tool.id, 10) : tool.id } },
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
      executionId = executionResult.records[0][0].longValue as number;
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
             const matchingPrompt = tool.prompts?.find(p => String(p.id) === String(value));
             if (matchingPrompt) {
                const prevResult = results.find(r => r.promptId === matchingPrompt.id);
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
                { name: 'executionId', value: { longValue: executionId! } },
                { name: 'promptId', value: { longValue: typeof prompt.id === 'string' ? parseInt(prompt.id, 10) : prompt.id } },
                { name: 'inputData', value: { stringValue: JSON.stringify(promptInputData) } },
                { name: 'startedAt', value: { stringValue: promptStartTime.toISOString().slice(0, 19).replace('T', ' ') } },
            ],
            transactionId
        }));
        
        if (!insertPromptResultResult.records || insertPromptResultResult.records.length === 0) {
          throw new Error("Failed to create prompt result record");
        }
        newPromptResultId = (insertPromptResultResult.records[0][0] as any).longValue as number;
        
        if (!prompt.modelId) throw new Error("No model ID specified for prompt");
        const modelId = typeof prompt.modelId === 'string' ? parseInt(prompt.modelId, 10) : prompt.modelId;
        const modelRecord = (await executeSQL<any>('SELECT model_id, provider FROM ai_models WHERE id = :id', [{name: 'id', value: {longValue: modelId}}]))[0] as any;
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
                { name: 'id', value: { longValue: newPromptResultId! } }
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
                  { name: 'id', value: { longValue: newPromptResultId! } }
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
            { name: 'id', value: { longValue: executionId! } }
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
    const userTools = await executeSQL<{ identifier: string }>(`
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
    const baseTools = await executeSQL<{ id: string; identifier: string; assistant_architect_id: string | null }>(`
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
    const approvedArchitects = await executeSQL<any>(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      WHERE status = 'approved' AND id = ANY(:architectIds)
      ORDER BY created_at DESC
    `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }]);

    if (approvedArchitects.length === 0) {
      return { isSuccess: true, message: "No approved architects found", data: [] };
    }
    
    // Fetch related fields and prompts for all approved architects
    const [allInputFieldsRaw, allPromptsRaw] = await Promise.all([
      executeSQL<any>(`
        SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
        FROM tool_input_fields
        WHERE assistant_architect_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }]),
      executeSQL<any>(`
        SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, parallel_group, timeout_seconds, created_at, updated_at
        FROM chain_prompts
        WHERE assistant_architect_id = ANY(:architectIds)
        ORDER BY position ASC
      `, [{ name: 'architectIds', value: { stringValue: `{${architectIds.join(',')}}` } }])
    ]);

    // Map relations back and transform to camelCase
    const results: ArchitectWithRelations[] = approvedArchitects.map((architect: FormattedRow) => {
      const transformedArchitect = transformSnakeToCamel<SelectAssistantArchitect>(architect);
      
      const inputFieldsForArchitect = allInputFieldsRaw
        .filter((f: any) => f.assistant_architect_id === architect.id)
        .map((field: any) => transformSnakeToCamel<SelectToolInputField>(field));
      
      const promptsForArchitect = allPromptsRaw
        .filter((p: any) => p.assistant_architect_id === architect.id)
        .map((prompt: any) => transformSnakeToCamel<SelectChainPrompt>(prompt));
      
      return {
        ...transformedArchitect,
        inputFields: inputFieldsForArchitect,
        prompts: promptsForArchitect
      };
    });

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

    const toolResult = await executeSQL<any>(`
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
      executeSQL<{ id: number }>(`
        SELECT id FROM tool_input_fields WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }]),
      executeSQL<{ id: number }>(`
        SELECT id FROM chain_prompts WHERE assistant_architect_id = :id
      `, [{ name: 'id', value: { longValue: parseInt(id, 10) } }])
    ]);

    if (!tool.name || !tool.description || inputFields.length === 0 || prompts.length === 0) {
      return { isSuccess: false, message: "Assistant is incomplete" }
    }

    await executeSQL<never>(`
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
    const executionResult = await executeSQL<SelectToolExecution>(`
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

    const execution = transformSnakeToCamel<SelectToolExecution>(executionResult[0]);

    // Get prompt results for this execution
    const promptResultsRaw = await executeSQL<any>(`
      SELECT id, execution_id, prompt_id, input_data, output_data, status, error_message, started_at, completed_at, execution_time_ms
      FROM prompt_results
      WHERE execution_id = :executionId
      ORDER BY started_at ASC
    `, [{ name: 'executionId', value: { longValue: parseInt(executionId, 10) } }]);
    
    // Transform to match SelectPromptResult type - note: the DB schema has evolved
    // but the type definition hasn't been updated to match
    const promptResultsData = promptResultsRaw.map((result: any) => {
      const transformedResult = transformSnakeToCamel<SelectPromptResult>(result);
      // Add additional fields from actual DB that aren't in the type definition
      return {
        ...transformedResult,
        result: result.output_data || result.result || '',
        aiModelId: null, // Not in current DB schema
        // Additional fields from actual DB
        inputData: result.input_data,
        outputData: result.output_data,
        status: result.status,
        errorMessage: result.error_message,
        startedAt: result.started_at,
        completedAt: result.completed_at,
        executionTimeMs: result.execution_time_ms
      } as SelectPromptResult & {
        inputData?: any;
        outputData?: string;
        status?: string;
        errorMessage?: string;
        startedAt?: Date;
        completedAt?: Date;
        executionTimeMs?: number;
      };
    });

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
    const toolsRaw = await executeSQL<any>(`
      SELECT id, identifier, name, description, assistant_architect_id, is_active, created_at, updated_at
      FROM tools
      WHERE is_active = true
      ORDER BY name ASC
    `);
    
    const tools = toolsRaw.map((tool: any) => {
      const transformed = transformSnakeToCamel<SelectTool>(tool);
      // Map assistant_architect_id to promptChainToolId for backward compatibility
      return {
        ...transformed,
        promptChainToolId: tool.assistant_architect_id
      } as SelectTool;
    });
    
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
    const aiModelsRaw = await executeSQL<any>(`
      SELECT id, name, provider, model_id, description, capabilities, max_tokens, active, chat_enabled, created_at, updated_at
      FROM ai_models
      ORDER BY name ASC
    `);
    
    const aiModels = aiModelsRaw.map((model: any) => transformSnakeToCamel<SelectAiModel>(model));
    
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
    const session = await getServerSession();
    if (!session || !session.sub) {
      return { isSuccess: false, message: "Unauthorized" }
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      return { isSuccess: false, message: "User not found" }
    }

    // Verify permissions
    const toolResult = await executeSQL<any>(
      `SELECT user_id FROM assistant_architects WHERE id = :id`,
      [{ name: 'id', value: { longValue: parseInt(toolId, 10) } }]
    )

    if (!toolResult || toolResult.length === 0) {
      return { isSuccess: false, message: "Tool not found" }
    }

    const tool = toolResult[0] as any;
    const toolUserId = tool.user_id;

    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator");
    if (!isAdmin && toolUserId !== userId) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Update positions for each prompt
    for (const { id, position } of positions) {
      await executeSQL<never>(
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
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view approved tools" }
    }

    // Get all approved tools
    const toolsResultRaw = await executeSQL<any>(
      `SELECT id, name, description, status, image_path, user_id, created_at, updated_at FROM assistant_architects WHERE status = :status`,
      [{ name: 'status', value: { stringValue: 'approved' } }]
    )
    
    const toolsResult = toolsResultRaw.map((raw: any) => transformSnakeToCamel<SelectAssistantArchitect>(raw))

    if (!toolsResult || toolsResult.length === 0) {
      return {
        isSuccess: true,
        message: "No approved tools found",
        data: []
      }
    }

    // Get related data for each tool
    const toolsWithRelations = await Promise.all(
      toolsResult.map(async (toolRecord) => {
        const toolId = String(toolRecord.id || '')
        
        // Run input fields and prompts queries in parallel
        const [inputFieldsResultRaw, promptsResultRaw] = await Promise.all([
          executeSQL<any>(
            `SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at FROM tool_input_fields WHERE assistant_architect_id = :toolId ORDER BY position ASC`,
            [{ name: 'toolId', value: { longValue: parseInt(toolId, 10) } }]
          ),
          executeSQL<any>(
            `SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, parallel_group, timeout_seconds, created_at, updated_at FROM chain_prompts WHERE assistant_architect_id = :toolId ORDER BY position ASC`,
            [{ name: 'toolId', value: { longValue: parseInt(toolId, 10) } }]
          )
        ]);
        
        const inputFieldsResult = inputFieldsResultRaw;
        const promptsResult = promptsResultRaw;

        // Map the tool record
        const tool = transformSnakeToCamel<SelectAssistantArchitect>(toolRecord);

        // Map input fields
        const inputFields = inputFieldsResult.map((record: any) => transformSnakeToCamel<SelectToolInputField>(record));

        // Map prompts
        const prompts = promptsResult.map((record: any) => transformSnakeToCamel<SelectChainPrompt>(record))

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
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Only administrators can view all assistants" }
    }
    // Get all assistants
    const allAssistants = await executeSQL<any>(`
      SELECT id, name, description, status, image_path, user_id, created_at, updated_at
      FROM assistant_architects
      ORDER BY created_at DESC
    `);
    
    // Get related data for each assistant
    const assistantsWithRelations = await Promise.all(
      allAssistants.map(async (tool) => {
        const [inputFieldsRaw, promptsRaw] = await Promise.all([
          executeSQL<any>(`
            SELECT * FROM tool_input_fields 
            WHERE assistant_architect_id = :toolId 
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }]),
          executeSQL<any>(`
            SELECT * FROM chain_prompts 
            WHERE assistant_architect_id = :toolId 
            ORDER BY position ASC
          `, [{ name: 'toolId', value: { longValue: tool.id } }])
        ]);
        
        // Transform input fields to camelCase
        const inputFields = inputFieldsRaw.map((field: any) => transformSnakeToCamel<SelectToolInputField>(field));
        
        // Transform prompts to camelCase
        const prompts = promptsRaw.map((prompt: any) => transformSnakeToCamel<SelectChainPrompt>(prompt));
        
        const transformedTool = transformSnakeToCamel<SelectAssistantArchitect>(tool);
        
        return {
          ...transformedTool,
          inputFields,
          prompts
        };
      })
    )
    return { isSuccess: true, message: "All assistants retrieved successfully", data: assistantsWithRelations }
  } catch (error) {
    logger.error("Error getting all assistants for admin:", error)
    return { isSuccess: false, message: "Failed to get all assistants" }
  }
}