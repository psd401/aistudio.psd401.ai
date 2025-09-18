import { executeSQL } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { parseRepositoryIds } from "@/lib/utils/repository-utils"
import type { SelectAssistantArchitect, SelectToolInputField, SelectChainPrompt } from "@/types/db-types"

// Database result types
interface ArchitectWithCreatorRaw {
  id: number
  name: string
  description: string | null
  status: string
  image_path: string | null
  user_id: number
  created_at: Date
  updated_at: Date
  creator_first_name: string | null
  creator_last_name: string | null
  creator_email: string | null
  cognito_sub: string | null
}

/**
 * Get all assistant architects with their related data
 */
export async function getAssistantArchitectsWithRelations() {
  const architectsRaw = await executeSQL<ArchitectWithCreatorRaw>(`
    SELECT a.id, a.name, a.description, a.status, a.image_path, a.user_id, a.created_at, a.updated_at,
           u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email,
           u.cognito_sub
    FROM assistant_architects a
    LEFT JOIN users u ON a.user_id = u.id
  `);

  return Promise.all(
    architectsRaw.map(async (architect) => {
      const [inputFieldsRaw, promptsRaw] = await Promise.all([
        getToolInputFields(architect.id),
        getChainPrompts(architect.id)
      ]);

      const inputFields = inputFieldsRaw.map((field) => transformSnakeToCamel<SelectToolInputField>(field));
      const prompts = promptsRaw.map((prompt) => {
        const transformed = transformSnakeToCamel<SelectChainPrompt>(prompt);
        transformed.repositoryIds = parseRepositoryIds(transformed.repositoryIds);
        // Parse enabled_tools from JSONB array to string array
        if (transformed.enabledTools && typeof transformed.enabledTools === 'string') {
          try {
            transformed.enabledTools = JSON.parse(transformed.enabledTools);
          } catch {
            transformed.enabledTools = [];
          }
        } else if (!transformed.enabledTools) {
          transformed.enabledTools = [];
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
}

/**
 * Get assistant architect by ID
 */
export async function getAssistantArchitectById(id: number) {
  const architectResult = await executeSQL<SelectAssistantArchitect>(`
    SELECT id, name, description, status, image_path, user_id, created_at, updated_at
    FROM assistant_architects
    WHERE id = :id
  `, [{ name: 'id', value: { longValue: id } }]);

  return architectResult[0] || null;
}

/**
 * Get tool input fields for an assistant architect
 */
export async function getToolInputFields(architectId: number) {
  return executeSQL<SelectToolInputField>(`
    SELECT id, assistant_architect_id, name, label, field_type, position, options, created_at, updated_at
    FROM tool_input_fields
    WHERE assistant_architect_id = :toolId
    ORDER BY position ASC
  `, [{ name: 'toolId', value: { longValue: architectId } }]);
}

/**
 * Get chain prompts for an assistant architect
 */
export async function getChainPrompts(architectId: number) {
  return executeSQL<SelectChainPrompt>(`
    SELECT id, assistant_architect_id, name, content, system_context, model_id, position, input_mapping, repository_ids, enabled_tools, created_at, updated_at
    FROM chain_prompts
    WHERE assistant_architect_id = :toolId
    ORDER BY position ASC
  `, [{ name: 'toolId', value: { longValue: architectId } }]);
}

/**
 * Get pending assistant architects
 */
export async function getPendingAssistantArchitects() {
  return executeSQL<SelectAssistantArchitect>(`
    SELECT id, name, description, status, image_path, user_id, created_at, updated_at
    FROM assistant_architects
    WHERE status = 'pending_approval'
    ORDER BY created_at DESC
  `);
}

/**
 * Update assistant architect status to pending and deactivate in tools table
 */
export async function updateAssistantArchitectToPending(id: number) {
  await executeSQL<never>(`
    UPDATE tools 
    SET is_active = false 
    WHERE assistant_architect_id = :id
  `, [{ name: 'id', value: { longValue: id } }]);
}

/**
 * Delete assistant architect from tools table
 */
export async function deleteAssistantArchitectFromTools(id: number) {
  await executeSQL<never>(`
    DELETE FROM tools
    WHERE prompt_chain_tool_id = :id
  `, [{ name: 'id', value: { longValue: id } }]);
}

/**
 * Delete assistant architect from navigation items
 */
export async function deleteAssistantArchitectFromNavigation(id: number) {
  await executeSQL<never>(`
    DELETE FROM navigation_items
    WHERE link = :link
  `, [{ name: 'link', value: { stringValue: `/tools/assistant-architect/${id}` } }]);
}