import { executeSQL, executeTransaction, createParameter } from './data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

/**
 * Get all roles assigned to a user
 */
export async function getUserRoles(userId: number): Promise<string[]> {
  const sql = `
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = :userId
    ORDER BY r.name
  `;
  
  const parameters = [createParameter('userId', userId)];
  const result = await executeSQL(sql, parameters);
  
  return result.map(row => row.name as string);
}

/**
 * Update user roles - supports multiple roles
 * @param userId - The user ID
 * @param roleNames - Array of role names to assign
 */
export async function updateUserRoles(userId: number, roleNames: string[]): Promise<{ success: boolean }> {
  const requestId = generateRequestId();
  const timer = startTimer("updateUserRoles");
  const log = createLogger({ requestId, function: "updateUserRoles" });
  
  log.info("Updating user roles", { userId, roleNames });
  
  try {
    // Get role IDs for the role names
    const roleQuery = `
      SELECT id, name 
      FROM roles 
      WHERE name = ANY(:roleNames::text[])
    `;
    
    // Format role names for PostgreSQL array
    const roleNamesParam = `{${roleNames.join(',')}}`; 
    const roleResult = await executeSQL(roleQuery, [
      { name: 'roleNames', value: { stringValue: roleNamesParam } }
    ]);
    
    if (roleResult.length !== roleNames.length) {
      const foundRoles = roleResult.map(r => r.name);
      const missingRoles = roleNames.filter(name => !foundRoles.includes(name));
      log.error("Some roles not found", { missingRoles });
      throw new Error(`Roles not found: ${missingRoles.join(', ')}`);
    }
    
    // Build transaction statements
    const statements = [
      {
        // Delete existing roles
        sql: 'DELETE FROM user_roles WHERE user_id = :userId',
        parameters: [createParameter('userId', userId)]
      }
    ];
    
    // Add insert statement for each role
    for (const role of roleResult) {
      statements.push({
        sql: 'INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)',
        parameters: [
          createParameter('userId', userId),
          createParameter('roleId', Number(role.id))
        ]
      });
    }
    
    // Increment role_version to invalidate cached sessions
    statements.push({
      sql: 'UPDATE users SET role_version = COALESCE(role_version, 0) + 1, updated_at = NOW() WHERE id = :userId',
      parameters: [createParameter('userId', userId)]
    });
    
    await executeTransaction(statements);
    
    log.info("User roles updated successfully", { 
      userId, 
      roleCount: roleNames.length 
    });
    timer({ status: "success" });
    
    return { success: true };
  } catch (error) {
    log.error("Failed to update user roles", {
      error: error instanceof Error ? error.message : "Unknown error",
      userId,
      roleNames
    });
    timer({ status: "error" });
    throw error;
  }
}

/**
 * Add a single role to a user (without removing existing roles)
 */
export async function addUserRole(userId: number, roleName: string): Promise<{ success: boolean }> {
  const log = createLogger({ function: "addUserRole" });
  
  try {
    // Get role ID
    const roleQuery = 'SELECT id FROM roles WHERE name = :roleName';
    const roleResult = await executeSQL(roleQuery, [
      createParameter('roleName', roleName)
    ]);
    
    if (roleResult.length === 0) {
      throw new Error(`Role '${roleName}' not found`);
    }
    
    const roleId = Number(roleResult[0].id);
    
    // Add role if not already assigned
    const statements = [
      {
        sql: `
          INSERT INTO user_roles (user_id, role_id) 
          VALUES (:userId, :roleId)
          ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        parameters: [
          createParameter('userId', userId),
          createParameter('roleId', roleId)
        ]
      },
      {
        sql: 'UPDATE users SET role_version = COALESCE(role_version, 0) + 1, updated_at = NOW() WHERE id = :userId',
        parameters: [createParameter('userId', userId)]
      }
    ];
    
    await executeTransaction(statements);
    
    log.info("Role added to user", { userId, roleName });
    return { success: true };
  } catch (error) {
    log.error("Failed to add role to user", {
      error: error instanceof Error ? error.message : "Unknown error",
      userId,
      roleName
    });
    throw error;
  }
}

/**
 * Remove a single role from a user
 */
export async function removeUserRole(userId: number, roleName: string): Promise<{ success: boolean }> {
  const log = createLogger({ function: "removeUserRole" });
  
  try {
    // Get role ID
    const roleQuery = 'SELECT id FROM roles WHERE name = :roleName';
    const roleResult = await executeSQL(roleQuery, [
      createParameter('roleName', roleName)
    ]);
    
    if (roleResult.length === 0) {
      throw new Error(`Role '${roleName}' not found`);
    }
    
    const roleId = Number(roleResult[0].id);
    
    // Remove role
    const statements = [
      {
        sql: 'DELETE FROM user_roles WHERE user_id = :userId AND role_id = :roleId',
        parameters: [
          createParameter('userId', userId),
          createParameter('roleId', roleId)
        ]
      },
      {
        sql: 'UPDATE users SET role_version = COALESCE(role_version, 0) + 1, updated_at = NOW() WHERE id = :userId',
        parameters: [createParameter('userId', userId)]
      }
    ];
    
    await executeTransaction(statements);
    
    log.info("Role removed from user", { userId, roleName });
    return { success: true };
  } catch (error) {
    log.error("Failed to remove role from user", {
      error: error instanceof Error ? error.message : "Unknown error",
      userId,
      roleName
    });
    throw error;
  }
}