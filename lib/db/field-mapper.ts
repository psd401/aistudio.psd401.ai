/**
 * Utility to transform database snake_case fields to TypeScript camelCase
 */

/**
 * Converts a snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Transforms an object with snake_case keys to camelCase keys
 */
export function transformSnakeToCamel<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformSnakeToCamel) as T;
  }

  if (typeof obj !== 'object') {
    return obj as T;
  }

  const transformed: Record<string, unknown> = {};
  const sourceObj = obj as Record<string, unknown>;
  
  for (const key in sourceObj) {
    if (Object.prototype.hasOwnProperty.call(sourceObj, key)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = sourceObj[key];
    }
  }

  return transformed as T;
}

/**
 * Type-safe field mapping for common database fields
 */
export const fieldMap = {
  // Common fields
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  user_id: 'userId',
  
  // Assistant Architect fields
  assistant_architect_id: 'assistantArchitectId',
  image_path: 'imagePath',
  tool_id: 'toolId',
  field_type: 'fieldType',
  system_context: 'systemContext',
  model_id: 'modelId',
  input_mapping: 'inputMapping',
  parallel_group: 'parallelGroup',
  timeout_seconds: 'timeoutSeconds',
  chain_prompt_id: 'chainPromptId',
  tool_execution_id: 'toolExecutionId',
  ai_model_id: 'aiModelId',
  prompt_chain_tool_id: 'promptChainToolId',
  
  // Conversation fields
  conversation_id: 'conversationId',
  
  // Document fields
  document_id: 'documentId',
  chunk_index: 'chunkIndex',
  
  // Navigation fields
  parent_id: 'parentId',
  requires_role: 'requiresRole',
  is_active: 'isActive',
  
  // User fields
  cognito_sub: 'cognitoSub',
  first_name: 'firstName',
  last_name: 'lastName',
  last_sign_in_at: 'lastSignInAt',
  
  // AI Model fields
  max_tokens: 'maxTokens',
  chat_enabled: 'chatEnabled',
  
  // Tool execution fields
  input_data: 'inputData',
  started_at: 'startedAt',
  completed_at: 'completedAt',
  error_message: 'errorMessage',
} as const;