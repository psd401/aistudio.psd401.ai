import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import logger from '@/lib/logger';

// Lazy-initialize the RDS Data API client
let client: RDSDataClient | null = null;

function getRDSClient(): RDSDataClient {
  if (!client) {
    // Use the Node.js credential provider chain which will:
    // 1. Check environment variables (AWS_ACCESS_KEY_ID, etc.)
    // 2. Check ECS container credentials (for Amplify WEB_COMPUTE)
    // 3. Check EC2 instance metadata
    // 4. Check shared credentials file
    // 5. Check ECS task role
    // In AWS Amplify, AWS_DEFAULT_REGION is automatically set
    const region = process.env.AWS_REGION || 
                   process.env.AWS_DEFAULT_REGION || 
                   process.env.NEXT_PUBLIC_AWS_REGION || 
                   'us-east-1';
    
    client = new RDSDataClient({ 
      region,
      credentials: fromNodeProviderChain(),
      maxAttempts: 3
    });
  }
  return client;
}

// Get Data API configuration at runtime
function getDataApiConfig() {
  if (!process.env.RDS_RESOURCE_ARN || !process.env.RDS_SECRET_ARN) {
    throw new Error(
      `Missing required environment variables. RDS_RESOURCE_ARN: ${process.env.RDS_RESOURCE_ARN ? 'set' : 'missing'}, RDS_SECRET_ARN: ${process.env.RDS_SECRET_ARN ? 'set' : 'missing'}`
    );
  }
  
  return {
    resourceArn: process.env.RDS_RESOURCE_ARN,
    secretArn: process.env.RDS_SECRET_ARN,
    // Database name is included in the secret, but we can specify it explicitly
    // The Data API will use the database from the secret if not specified
    database: 'aistudio'
  };
}

/**
 * Convert Data API response to a more usable format
 */
function formatDataApiResponse(response: any) {
  if (!response.records) return [];
  
  const columns = response.columnMetadata?.map((col: any) => col.name) || [];
  
  return response.records.map((record: any) => {
    const row: any = {};
    record.forEach((field: any, index: number) => {
      const columnName = columns[index];
      // Extract the actual value from the field object
      let value;
      if (field.isNull) {
        value = null;
      } else if (field.stringValue !== undefined) {
        value = field.stringValue;
      } else if (field.longValue !== undefined) {
        value = field.longValue;
      } else if (field.doubleValue !== undefined) {
        value = field.doubleValue;
      } else if (field.booleanValue !== undefined) {
        value = field.booleanValue;
      } else if (field.blobValue !== undefined) {
        value = field.blobValue;
      } else if (field.arrayValue !== undefined) {
        value = field.arrayValue;
      } else {
        value = null;
      }
      row[columnName] = value;
    });
    return row;
  });
}

/**
 * Execute a single SQL statement
 */
export async function executeSQL(sql: string, parameters: any[] = []) {
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const config = getDataApiConfig();
      if (process.env.SQL_LOGGING !== 'false') {
        logger.debug('Executing SQL', { 
          hasResourceArn: !!config.resourceArn,
          hasSecretArn: !!config.secretArn,
          database: config.database,
          attempt
        });
      }
      
      const command = new ExecuteStatementCommand({
        ...config,
        sql,
        parameters: parameters.length > 0 ? parameters : undefined,
        includeResultMetadata: true
      });

      const response = await getRDSClient().send(command);
      if (process.env.SQL_LOGGING !== 'false') {
        logger.debug('SQL executed successfully');
      }
      return formatDataApiResponse(response);
    } catch (error: any) {
      logger.error(`Data API Error (attempt ${attempt}/${maxRetries}):`, error);
      lastError = error;
      
      // Check if it's a retryable error
      if (
        error.name === 'InternalServerErrorException' ||
        error.name === 'ServiceUnavailableException' ||
        error.name === 'ThrottlingException' ||
        error.$metadata?.httpStatusCode === 500 ||
        error.$metadata?.httpStatusCode === 503
      ) {
        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          if (process.env.SQL_LOGGING !== 'false') {
            logger.debug(`Retrying in ${delay}ms...`);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Non-retryable error or max retries reached
      throw error;
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
}

/**
 * Execute multiple SQL statements in a transaction
 */
export async function executeTransaction(statements: Array<{ sql: string, parameters?: any[] }>) {
  const transactionId = await beginTransaction();
  
  try {
    const results = [];
    for (const stmt of statements) {
      const result = await executeSQL(stmt.sql, stmt.parameters);
      results.push(result);
    }
    
    await commitTransaction(transactionId);
    return results;
  } catch (error) {
    await rollbackTransaction(transactionId);
    throw error;
  }
}

async function beginTransaction() {
  const command = new ExecuteStatementCommand({
    ...getDataApiConfig(),
    sql: 'BEGIN'
  });
  const response = await getRDSClient().send(command);
  return response.transactionId!;
}

async function commitTransaction(transactionId: string) {
  const command = new ExecuteStatementCommand({
    ...getDataApiConfig(),
    sql: 'COMMIT',
    transactionId
  });
  await getRDSClient().send(command);
}

async function rollbackTransaction(transactionId: string) {
  const command = new ExecuteStatementCommand({
    ...getDataApiConfig(),
    sql: 'ROLLBACK',
    transactionId
  });
  await getRDSClient().send(command);
}

/**
 * Navigation management functions
 */
export async function getNavigationItems(activeOnly: boolean = false) {
  const sql = activeOnly ? `
    SELECT id, label, icon, link, parent_id, description, type,
           tool_id, requires_role, position, is_active, created_at
    FROM navigation_items 
    WHERE is_active = true 
    ORDER BY position ASC
  ` : `
    SELECT id, label, icon, link, parent_id, description, type,
           tool_id, requires_role, position, is_active, created_at
    FROM navigation_items 
    ORDER BY position ASC
  `;
  
  return executeSQL(sql);
}

export async function createNavigationItem(data: {
  label: string;
  icon: string;
  link?: string;
  description?: string;
  type: string;
  parentId?: number;
  toolId?: number;
  requiresRole?: string;
  position?: number;
  isActive?: boolean;
}) {
  const sql = `
    INSERT INTO navigation_items (
      label, icon, link, description, type, parent_id, 
      tool_id, requires_role, position, is_active, created_at
    )
    VALUES (
      :label, :icon, :link, :description, :type::navigation_type, :parentId,
      :toolId, :requiresRole, :position, :isActive, NOW()
    )
    RETURNING *
  `;
  
  const parameters = [
    { name: 'label', value: { stringValue: data.label } },
    { name: 'icon', value: { stringValue: data.icon } },
    { name: 'link', value: data.link ? { stringValue: data.link } : { isNull: true } },
    { name: 'description', value: data.description ? { stringValue: data.description } : { isNull: true } },
    { name: 'type', value: { stringValue: data.type } },
    { name: 'parentId', value: data.parentId ? { longValue: data.parentId } : { isNull: true } },
    { name: 'toolId', value: data.toolId ? { longValue: data.toolId } : { isNull: true } },
    { name: 'requiresRole', value: data.requiresRole ? { stringValue: data.requiresRole } : { isNull: true } },
    { name: 'position', value: { longValue: data.position || 0 } },
    { name: 'isActive', value: { booleanValue: data.isActive ?? true } }
  ];
  
  const result = await executeSQL(sql, parameters);
  
  if (!result || result.length === 0) {
    throw new Error('Failed to create navigation item');
  }
  
  return formatNavigationItem(result[0]);
}

export async function updateNavigationItem(id: number, data: Partial<{
  label: string;
  icon: string;
  link: string;
  description: string;
  type: string;
  parentId: number;
  toolId: number;
  requiresRole: string;
  position: number;
  isActive: boolean;
}>) {
  const fields = [];
  const parameters = [{ name: 'id', value: { longValue: id } }];
  let paramIndex = 0;
  
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = toSnakeCase(key);
    // Special handling for enum type field
    if (key === 'type') {
      fields.push(`${snakeKey} = :param${paramIndex}::navigation_type`);
    } else {
      fields.push(`${snakeKey} = :param${paramIndex}`);
    }
    
    let paramValue;
    if (value === null || value === undefined) {
      paramValue = { isNull: true };
    } else if (typeof value === 'boolean') {
      paramValue = { booleanValue: value };
    } else if (typeof value === 'number') {
      paramValue = { longValue: value };
    } else {
      paramValue = { stringValue: String(value) };
    }
    
    parameters.push({ name: `param${paramIndex}`, value: paramValue });
    paramIndex++;
  }
  
  if (fields.length === 0) {
    throw new Error('No fields to update');
  }
  
  const sql = `
    UPDATE navigation_items
    SET ${fields.join(', ')}
    WHERE id = :id
    RETURNING *
  `;
  
  const result = await executeSQL(sql, parameters);
  
  if (!result || result.length === 0) {
    throw new Error(`Navigation item with id ${id} not found or update failed`);
  }
  
  return formatNavigationItem(result[0]);
}

export async function deleteNavigationItem(id: number) {
  const sql = `
    DELETE FROM navigation_items
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [{ name: 'id', value: { longValue: id } }];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

function formatNavigationItem(item: any) {
  if (!item) {
    throw new Error('Navigation item not found');
  }
  
  return {
    id: item.id,
    label: item.label,
    icon: item.icon,
    link: item.link,
    description: item.description,
    type: item.type,
    parentId: item.parent_id,
    toolId: item.tool_id,
    requiresRole: item.requires_role,
    position: item.position,
    isActive: item.is_active,
    createdAt: item.created_at
  };
}

/**
 * User management functions
 */
export async function getUsers() {
  const query = `
    SELECT id, cognito_sub, email, first_name, last_name,
           last_sign_in_at, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `;
  
  return executeSQL(query);
}

export async function getUserRoles() {
  const sql = `
    SELECT ur.user_id, r.name as role_name
    FROM user_roles ur
    INNER JOIN roles r ON r.id = ur.role_id
    ORDER BY r.name ASC
  `;
  
  return executeSQL(sql);
}

export interface UserData {
  id?: number;
  cognitoSub: string;
  email: string;
  firstName?: string;
}

export async function createUser(userData: UserData) {
  const query = `
    INSERT INTO users (cognito_sub, email, first_name, created_at, updated_at)
    VALUES (:cognitoSub, :email, :firstName, NOW(), NOW())
    RETURNING id, cognito_sub, email, first_name, last_name, created_at, updated_at
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: userData.cognitoSub } },
    { name: 'email', value: { stringValue: userData.email } },
    { name: 'firstName', value: userData.firstName ? { stringValue: userData.firstName } : { isNull: true } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0];
}

export async function updateUser(id: number, updates: Record<string, any>) {
  // Build dynamic UPDATE statement
  const updateFields = Object.keys(updates)
    .filter(key => key !== 'id')
    .map((key, index) => `${toSnakeCase(key)} = :param${index}`);
  
  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }
  
  const sql = `
    UPDATE users 
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } },
    ...Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([key, value], index) => ({
        name: `param${index}`,
        value: value === null ? { isNull: true } : { stringValue: String(value) }
      }))
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function deleteUser(id: number) {
  const sql = `
    DELETE FROM users 
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

/**
 * Fetch user by Cognito sub
 */
export async function getUserByCognitoSub(cognitoSub: string) {
  const query = `
    SELECT id, cognito_sub, email, first_name, last_name,
           last_sign_in_at, created_at, updated_at
    FROM users
    WHERE cognito_sub = :cognitoSub
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0];
}

export async function checkUserRole(userId: number, roleName: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_roles ur
    JOIN users u ON ur.user_id = u.id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.id = :userId AND r.name = :roleName
  `;

  const parameters = [
    { name: 'userId', value: { longValue: userId } },
    { name: 'roleName', value: { stringValue: roleName } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0].count > 0;
}

export async function checkUserRoleByCognitoSub(cognitoSub: string, roleName: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_roles ur
    JOIN users u ON ur.user_id = u.id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.cognito_sub = :cognitoSub AND r.name = :roleName
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } },
    { name: 'roleName', value: { stringValue: roleName } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0].count > 0;
}

export async function getUserIdByCognitoSub(cognitoSub: string): Promise<string | null> {
  const query = `
    SELECT id
    FROM users
    WHERE cognito_sub = :cognitoSub
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0]?.id || null;
}

/**
 * Get user roles by cognito sub
 */
export async function getUserRolesByCognitoSub(cognitoSub: string): Promise<string[]> {
  const query = `
    SELECT r.name
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    JOIN users u ON ur.user_id = u.id
    WHERE u.cognito_sub = :cognitoSub
    ORDER BY r.name ASC
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result.map((row: any) => row.name);
}

export async function hasToolAccess(cognitoSub: string, toolIdentifier: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN role_tools rt ON ur.role_id = rt.role_id
    JOIN tools t ON rt.tool_id = t.id
    WHERE u.cognito_sub = :cognitoSub
      AND t.identifier = :toolIdentifier
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } },
    { name: 'toolIdentifier', value: { stringValue: toolIdentifier } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result[0].count > 0;
}

export async function getUserTools(cognitoSub: string): Promise<string[]> {
  const query = `
    SELECT DISTINCT t.identifier
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN role_tools rt ON ur.role_id = rt.role_id
    JOIN tools t ON rt.tool_id = t.id
    WHERE u.cognito_sub = :cognitoSub
  `;

  const parameters = [
    { name: 'cognitoSub', value: { stringValue: cognitoSub } }
  ];
  
  const result = await executeSQL(query, parameters);
  return result.map((r: any) => r.identifier);
}

// Helper function to convert camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Role management functions
 */
export async function getRoleByName(roleName: string) {
  const sql = `
    SELECT id, name
    FROM roles
    WHERE name = :roleName
  `;
  
  const parameters = [
    { name: 'roleName', value: { stringValue: roleName } }
  ];
  
  return executeSQL(sql, parameters);
}

export async function updateUserRole(userId: number, newRoleName: string) {
  const [role] = await getRoleByName(newRoleName);
  if (!role) {
    throw new Error(`Role '${newRoleName}' not found`);
  }
  
  // Start a transaction to update user roles
  const statements = [
    {
      sql: 'DELETE FROM user_roles WHERE user_id = :userId',
      parameters: [{ name: 'userId', value: { longValue: userId } }]
    },
    {
      sql: 'INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)',
      parameters: [
        { name: 'userId', value: { longValue: userId } },
        { name: 'roleId', value: { longValue: role.id } }
      ]
    }
  ];
  
  await executeTransaction(statements);
  return { success: true };
}

export async function getRoles() {
  const sql = `
    SELECT id, name, description, is_system, created_at, updated_at
    FROM roles
    ORDER BY name ASC
  `;
  
  const result = await executeSQL(sql);
  // Convert snake_case to camelCase
  return result.map((role: any) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    createdAt: role.created_at,
    updatedAt: role.updated_at
  }));
}

/**
 * AI Models functions
 */
export async function getAIModels() {
  const sql = `
    SELECT id, name, provider, model_id, description, capabilities, 
           max_tokens, active, chat_enabled, created_at, updated_at
    FROM ai_models
    ORDER BY name ASC
  `;
  
  return executeSQL(sql);
}

export async function createAIModel(modelData: {
  name: string;
  modelId: string;
  provider?: string;
  description?: string;
  capabilities?: string;
  maxTokens?: number;
  isActive?: boolean;
  chatEnabled?: boolean;
}) {
  const sql = `
    INSERT INTO ai_models (name, model_id, provider, description, capabilities, max_tokens, active, chat_enabled, created_at, updated_at)
    VALUES (:name, :modelId, :provider, :description, :capabilities, :maxTokens, :isActive, :chatEnabled, NOW(), NOW())
    RETURNING *
  `;
  
  const parameters = [
    { name: 'name', value: { stringValue: modelData.name } },
    { name: 'modelId', value: { stringValue: modelData.modelId } },
    { name: 'provider', value: modelData.provider ? { stringValue: modelData.provider } : { isNull: true } },
    { name: 'description', value: modelData.description ? { stringValue: modelData.description } : { isNull: true } },
    { name: 'capabilities', value: modelData.capabilities ? { stringValue: modelData.capabilities } : { isNull: true } },
    { name: 'maxTokens', value: modelData.maxTokens ? { longValue: modelData.maxTokens } : { isNull: true } },
    { name: 'isActive', value: { booleanValue: modelData.isActive ?? true } },
    { name: 'chatEnabled', value: { booleanValue: modelData.chatEnabled ?? false } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function updateAIModel(id: number, updates: Record<string, any>) {
  // Convert camelCase keys to snake_case for the database
  const snakeCaseUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = toSnakeCase(key);
    snakeCaseUpdates[snakeKey] = value;
  }
  
  const updateFields = Object.keys(snakeCaseUpdates)
    .filter(key => key !== 'id')
    .map((key, index) => `${key} = :param${index}`);
  
  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }
  
  const sql = `
    UPDATE ai_models 
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } },
    ...Object.entries(snakeCaseUpdates)
      .filter(([key]) => key !== 'id')
      .map(([key, value], index) => ({
        name: `param${index}`,
        value: value === null ? { isNull: true } : 
               typeof value === 'boolean' ? { booleanValue: value } :
               typeof value === 'number' ? { longValue: value } :
               { stringValue: String(value) }
      }))
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function deleteAIModel(id: number) {
  const sql = `
    DELETE FROM ai_models 
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function assignRoleToUser(userId: number, roleId: number) {
  const sql = `
    INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
    VALUES (:userId, :roleId, NOW(), NOW())
    RETURNING *
  `
  const parameters = [
    { name: "userId", value: { longValue: userId } },
    { name: "roleId", value: { longValue: roleId } }
  ]
  return executeSQL(sql, parameters)
}

/**
 * Tools functions
 */
export async function getTools() {
  const sql = `
    SELECT id, identifier, name, description, 
           prompt_chain_tool_id as assistant_architect_id, is_active, 
           created_at, updated_at
    FROM tools
    WHERE is_active = true
    ORDER BY name ASC
  `;
  
  const result = await executeSQL(sql);
  // Convert snake_case to camelCase
  return result.map((tool: any) => ({
    id: tool.id,
    identifier: tool.identifier,
    name: tool.name,
    description: tool.description,
    assistantArchitectId: tool.assistant_architect_id,
    isActive: tool.is_active,
    createdAt: tool.created_at,
    updatedAt: tool.updated_at
  }));
}

/**
 * Create a new role
 */
export async function createRole(roleData: {
  name: string;
  description?: string;
  isSystem?: boolean;
}) {
  const sql = `
    INSERT INTO roles (name, description, is_system, created_at, updated_at)
    VALUES (:name, :description, :isSystem, NOW(), NOW())
    RETURNING id, name, description, is_system, created_at, updated_at
  `;
  
  const parameters: any[] = [
    { name: 'name', value: { stringValue: roleData.name } },
    { name: 'description', value: roleData.description ? { stringValue: roleData.description } : { isNull: true } },
    { name: 'isSystem', value: { booleanValue: roleData.isSystem ?? false } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

/**
 * Update an existing role
 */
export async function updateRole(id: number, updates: {
  name?: string;
  description?: string;
}) {
  const updateFields = [];
  const parameters: any[] = [
    { name: 'id', value: { longValue: id } }
  ];
  
  if (updates.name !== undefined) {
    updateFields.push('name = :name');
    parameters.push({ name: 'name', value: { stringValue: updates.name } });
  }
  
  if (updates.description !== undefined) {
    updateFields.push('description = :description');
    parameters.push({ 
      name: 'description', 
      value: updates.description ? { stringValue: updates.description } : { isNull: true }
    });
  }
  
  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }
  
  const sql = `
    UPDATE roles 
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = :id AND is_system = false
    RETURNING id, name, description, is_system, created_at, updated_at
  `;
  
  const result = await executeSQL(sql, parameters);
  if (result.length === 0) {
    throw new Error('Role not found or is a system role');
  }
  return result[0];
}

/**
 * Delete a role (only non-system roles)
 */
export async function deleteRole(id: number) {
  const sql = `
    DELETE FROM roles 
    WHERE id = :id AND is_system = false
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  const result = await executeSQL(sql, parameters);
  if (result.length === 0) {
    throw new Error('Role not found or is a system role');
  }
  return result[0];
}

/**
 * Get all tools assigned to a role
 */
export async function getRoleTools(roleId: number) {
  const sql = `
    SELECT t.id, t.identifier, t.name, t.description, 
           t.is_active, t.created_at, t.updated_at
    FROM tools t
    JOIN role_tools rt ON t.id = rt.tool_id
    WHERE rt.role_id = :roleId
    ORDER BY t.name ASC
  `;
  
  const parameters = [
    { name: 'roleId', value: { stringValue: roleId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  // Convert snake_case to camelCase
  return result.map((tool: any) => ({
    id: tool.id,
    identifier: tool.identifier,
    name: tool.name,
    description: tool.description,
    isActive: tool.is_active,
    createdAt: tool.created_at,
    updatedAt: tool.updated_at
  }));
}

/**
 * Assign a tool to a role
 */
export async function assignToolToRole(roleId: string, toolId: string) {
  // First check if the assignment already exists
  const checkSql = `
    SELECT 1 FROM role_tools 
    WHERE role_id = :roleId AND tool_id = :toolId
  `;
  
  const checkParams = [
    { name: 'roleId', value: { stringValue: roleId } },
    { name: 'toolId', value: { stringValue: toolId } }
  ];
  
  const existing = await executeSQL(checkSql, checkParams);
  
  if (existing.length > 0) {
    return true; // Already assigned
  }
  
  // Insert the new assignment
  const insertSql = `
    INSERT INTO role_tools (role_id, tool_id, created_at)
    VALUES (:roleId, :toolId, NOW())
    RETURNING *
  `;
  
  const insertParams = [
    { name: 'roleId', value: { stringValue: roleId } },
    { name: 'toolId', value: { stringValue: toolId } }
  ];
  
  const result = await executeSQL(insertSql, insertParams);
  return result.length > 0;
}

/**
 * Remove a tool from a role
 */
export async function removeToolFromRole(roleId: string, toolId: string) {
  const sql = `
    DELETE FROM role_tools
    WHERE role_id = :roleId AND tool_id = :toolId
    RETURNING *
  `;
  
  const parameters = [
    { name: 'roleId', value: { stringValue: roleId } },
    { name: 'toolId', value: { stringValue: toolId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result.length > 0;
}

/**
 * Assistant Architect functions
 */
export async function getAssistantArchitects() {
  const sql = `
    SELECT 
      a.id, 
      a.name, 
      a.description, 
      a.image_path,
      a.user_id,
      a.status, 
      a.created_at, 
      a.updated_at,
      u.first_name AS creator_first_name, 
      u.last_name AS creator_last_name, 
      u.email AS creator_email
    FROM assistant_architects a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
  `;
  
  const assistants = await executeSQL(sql);
  
  // Transform snake_case to camelCase and include creator info
  return assistants.map((assistant: any) => ({
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    imagePath: assistant.image_path,
    userId: assistant.user_id || 'unknown',
    status: assistant.status,
    createdAt: assistant.created_at,
    updatedAt: assistant.updated_at,
    creator: assistant.creator_first_name || assistant.creator_last_name || assistant.creator_email
      ? {
          id: assistant.user_id,
          firstName: assistant.creator_first_name,
          lastName: assistant.creator_last_name,
          email: assistant.creator_email
        }
      : null
  }));
}

export async function createAssistantArchitect(data: {
  name: string;
  description?: string;
  userId: string;
  status?: string;
}) {
  const sql = `
    INSERT INTO assistant_architects (id, name, description, user_id, status, created_at, updated_at)
    VALUES (gen_random_uuid(), :name, :description, :userId, :status, NOW(), NOW())
    RETURNING *
  `;
  
  const parameters = [
    { name: 'name', value: { stringValue: data.name } },
    { name: 'description', value: data.description ? { stringValue: data.description } : { isNull: true } },
    { name: 'userId', value: { stringValue: data.userId } },
    { name: 'status', value: { stringValue: data.status || 'draft' } }
  ];
  
  const result = await executeSQL(sql, parameters);
  const assistant = result[0];
  
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    imagePath: assistant.image_path,
    userId: assistant.user_id,
    status: assistant.status,
    createdAt: assistant.created_at,
    updatedAt: assistant.updated_at
  };
}

export async function updateAssistantArchitect(id: number, updates: Record<string, any>) {
  const updateFields = [];
  const parameters: any[] = [
    { name: 'id', value: { longValue: id } }
  ];
  
  let paramIndex = 0;
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = toSnakeCase(key);
    updateFields.push(`${snakeKey} = :param${paramIndex}`);
    
    let paramValue;
    if (value === null || value === undefined) {
      paramValue = { isNull: true };
    } else if (snakeKey === 'status') {
      // Cast status enum
      updateFields[updateFields.length - 1] = `${snakeKey} = :param${paramIndex}::tool_status`;
      paramValue = { stringValue: String(value) };
    } else {
      paramValue = { stringValue: String(value) };
    }
    
    parameters.push({ name: `param${paramIndex}`, value: paramValue });
    paramIndex++;
  }
  
  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }
  
  const sql = `
    UPDATE assistant_architects 
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = :id
    RETURNING *
  `;
  
  const result = await executeSQL(sql, parameters);
  const assistant = result[0];
  
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    imagePath: assistant.image_path,
    userId: assistant.user_id,
    status: assistant.status,
    createdAt: assistant.created_at,
    updatedAt: assistant.updated_at
  };
}

export async function deleteAssistantArchitect(id: number) {
  // Delete related records first to avoid foreign key constraint violations
  
  // Delete chain prompts
  await executeSQL(`
    DELETE FROM chain_prompts 
    WHERE assistant_architect_id = :id
  `, [{ name: 'id', value: { longValue: id } }]);
  
  // Delete tool input fields
  await executeSQL(`
    DELETE FROM tool_input_fields 
    WHERE assistant_architect_id = :id
  `, [{ name: 'id', value: { longValue: id } }]);
  
  // Delete tool executions (if any)
  await executeSQL(`
    DELETE FROM tool_executions 
    WHERE assistant_architect_id = :id
  `, [{ name: 'id', value: { longValue: id } }]);
  
  // Note: The tools table is linked differently - tools have their own lifecycle
  // and are not directly tied to assistant architects via foreign key
  
  // Finally delete the assistant architect
  const sql = `
    DELETE FROM assistant_architects 
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function approveAssistantArchitect(id: number) {
  const sql = `
    UPDATE assistant_architects 
    SET status = 'approved'::tool_status, updated_at = NOW()
    WHERE id = :id
    RETURNING *
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  const result = await executeSQL(sql, parameters);
  const assistant = result[0];
  
  // Also create the tool entry if needed
  await executeSQL(`
    INSERT INTO tools (id, identifier, name, description, prompt_chain_tool_id, is_active, created_at, updated_at)
    SELECT gen_random_uuid(), 
           LOWER(REPLACE(name, ' ', '-')), 
           name, 
           description, 
           id, 
           true, 
           NOW(), 
           NOW()
    FROM assistant_architects
    WHERE id = :id
    AND NOT EXISTS (
      SELECT 1 FROM tools WHERE prompt_chain_tool_id = :id
    )
  `, parameters);
  
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    imagePath: assistant.image_path,
    userId: assistant.user_id,
    status: assistant.status,
    createdAt: assistant.created_at,
    updatedAt: assistant.updated_at
  };
}

export async function rejectAssistantArchitect(id: number) {
  const sql = `
    UPDATE assistant_architects 
    SET status = 'rejected'::tool_status, updated_at = NOW()
    WHERE id = :id
  `;
  
  const parameters = [
    { name: 'id', value: { longValue: id } }
  ];
  
  await executeSQL(sql, parameters);
} 