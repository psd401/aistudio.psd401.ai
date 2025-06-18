import { RDSDataClient, ExecuteStatementCommand, BatchExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

// Initialize the RDS Data API client
const client = new RDSDataClient({ 
  region: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
  // For local development, you'll need AWS credentials configured
  // via AWS CLI, environment variables, or IAM roles
});

const dataApiConfig = {
  resourceArn: process.env.RDS_RESOURCE_ARN!,
  secretArn: process.env.RDS_SECRET_ARN!,
  database: process.env.RDS_DATABASE_NAME || 'aistudio'
};

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
  try {
    const command = new ExecuteStatementCommand({
      ...dataApiConfig,
      sql,
      parameters: parameters.length > 0 ? parameters : undefined,
      includeResultMetadata: true
    });

    const response = await client.send(command);
    return formatDataApiResponse(response);
  } catch (error) {
    console.error('Data API Error:', error);
    throw error;
  }
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
    ...dataApiConfig,
    sql: 'BEGIN'
  });
  const response = await client.send(command);
  return response.transactionId!;
}

async function commitTransaction(transactionId: string) {
  const command = new ExecuteStatementCommand({
    ...dataApiConfig,
    sql: 'COMMIT',
    transactionId
  });
  await client.send(command);
}

async function rollbackTransaction(transactionId: string) {
  const command = new ExecuteStatementCommand({
    ...dataApiConfig,
    sql: 'ROLLBACK',
    transactionId
  });
  await client.send(command);
}

/**
 * Example usage for your navigation query
 */
export async function getNavigationItems() {
  const sql = `
    SELECT id, label, icon, link, parent_id, 
           tool_id, requires_role, position, is_active
    FROM navigation_items 
    WHERE is_active = true 
    ORDER BY position ASC
  `;
  
  return executeSQL(sql);
}

/**
 * User management functions
 */
export async function getUsers() {
  const sql = `
    SELECT id, clerk_id, first_name, last_name, email, 
           last_sign_in_at, created_at, updated_at
    FROM users
    ORDER BY created_at ASC
  `;
  
  return executeSQL(sql);
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

export async function createUser(userData: {
  clerkId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const sql = `
    INSERT INTO users (clerk_id, first_name, last_name, email, created_at, updated_at)
    VALUES (:clerkId, :firstName, :lastName, :email, NOW(), NOW())
    RETURNING *
  `;
  
  const parameters = [
    { name: 'clerkId', value: { stringValue: userData.clerkId } },
    { name: 'firstName', value: userData.firstName ? { stringValue: userData.firstName } : { isNull: true } },
    { name: 'lastName', value: userData.lastName ? { stringValue: userData.lastName } : { isNull: true } },
    { name: 'email', value: userData.email ? { stringValue: userData.email } : { isNull: true } }
  ];
  
  const result = await executeSQL(sql, parameters);
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

export async function getUserByClerkId(clerkId: string) {
  const sql = `
    SELECT id, clerk_id, first_name, last_name, email, 
           last_sign_in_at, created_at, updated_at
    FROM users
    WHERE clerk_id = :clerkId
    LIMIT 1
  `;
  
  const parameters = [
    { name: 'clerkId', value: { stringValue: clerkId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function hasUserRole(userId: string, roleName: string): Promise<boolean> {
  const sql = `
    SELECT 1
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id
    INNER JOIN roles r ON r.id = ur.role_id
    WHERE u.clerk_id = :userId AND r.name = :roleName
    LIMIT 1
  `;
  
  const parameters = [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'roleName', value: { stringValue: roleName } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result.length > 0;
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
    SELECT id, name, description
    FROM roles
    WHERE name = :roleName
    LIMIT 1
  `;
  
  const parameters = [
    { name: 'roleName', value: { stringValue: roleName } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function updateUserRole(userId: number, newRoleName: string) {
  // First get the role ID
  const role = await getRoleByName(newRoleName);
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
    SELECT id, name, description
    FROM roles
    ORDER BY name ASC
  `;
  
  return executeSQL(sql);
}

/**
 * AI Models functions
 */
export async function getAIModels() {
  const sql = `
    SELECT id, name, model_id, description, active, 
           created_at, updated_at
    FROM ai_models
    ORDER BY name ASC
  `;
  
  return executeSQL(sql);
}

export async function createAIModel(modelData: {
  name: string;
  modelId: string;
  description?: string;
  isActive?: boolean;
}) {
  const sql = `
    INSERT INTO ai_models (name, model_id, description, active, created_at, updated_at)
    VALUES (:name, :modelId, :description, :isActive, NOW(), NOW())
    RETURNING *
  `;
  
  const parameters = [
    { name: 'name', value: { stringValue: modelData.name } },
    { name: 'modelId', value: { stringValue: modelData.modelId } },
    { name: 'description', value: modelData.description ? { stringValue: modelData.description } : { isNull: true } },
    { name: 'isActive', value: { booleanValue: modelData.isActive ?? true } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0];
}

export async function updateAIModel(id: number, updates: Record<string, any>) {
  const updateFields = Object.keys(updates)
    .filter(key => key !== 'id')
    .map((key, index) => `${toSnakeCase(key)} = :param${index}`);
  
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
    ...Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([key, value], index) => ({
        name: `param${index}`,
        value: value === null ? { isNull: true } : 
               typeof value === 'boolean' ? { booleanValue: value } :
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

/**
 * Tool access functions
 */
export async function getUserIdByClerkId(clerkId: string): Promise<number | null> {
  const sql = `
    SELECT id 
    FROM users 
    WHERE clerk_id = :clerkId
    LIMIT 1
  `;
  
  const parameters = [
    { name: 'clerkId', value: { stringValue: clerkId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result[0]?.id || null;
}

export async function getUserRolesByUserId(userId: number): Promise<string[]> {
  const sql = `
    SELECT r.name
    FROM user_roles ur
    INNER JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = :userId
  `;
  
  const parameters = [
    { name: 'userId', value: { longValue: userId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result.map(r => r.name);
}

export async function getUserRolesByClerkId(clerkId: string): Promise<string[]> {
  const userId = await getUserIdByClerkId(clerkId);
  if (!userId) return [];
  
  return getUserRolesByUserId(userId);
}

export async function hasToolAccess(clerkId: string, toolIdentifier: string): Promise<boolean> {
  const sql = `
    SELECT 1
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id
    INNER JOIN role_tools rt ON rt.role_id = ur.role_id
    INNER JOIN tools t ON t.id = rt.tool_id
    WHERE u.clerk_id = :clerkId 
      AND t.identifier = :toolIdentifier 
      AND t.is_active = true
    LIMIT 1
  `;
  
  const parameters = [
    { name: 'clerkId', value: { stringValue: clerkId } },
    { name: 'toolIdentifier', value: { stringValue: toolIdentifier } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result.length > 0;
}

export async function getUserTools(clerkId: string): Promise<string[]> {
  const sql = `
    SELECT DISTINCT t.identifier
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id
    INNER JOIN role_tools rt ON rt.role_id = ur.role_id
    INNER JOIN tools t ON t.id = rt.tool_id
    WHERE u.clerk_id = :clerkId 
      AND t.is_active = true
  `;
  
  const parameters = [
    { name: 'clerkId', value: { stringValue: clerkId } }
  ];
  
  const result = await executeSQL(sql, parameters);
  return result.map(r => r.identifier);
} 