"use server"

import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable, rolesTable, userRolesTable, roleToolsTable, toolsTable } from '@/db/schema';
import type { Role } from '@/types';
import { eq, and, inArray } from 'drizzle-orm';

const roleHierarchy: Record<Role, number> = {
  student: 0,
  staff: 1,
  administrator: 2
};

export async function syncUserRole(userId: string) {
  try {
    // Get user's roles from the database via user_roles table
    const userRoles = await getUserRoles(userId);
    const highestRole = await getHighestUserRole(userId);

    // Get user from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    
    // Update Clerk public metadata with all roles
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        // Keep highest role for backward compatibility
        role: highestRole || 'staff',
        // Add all roles as an array
        roles: userRoles
      },
    });
    
    return highestRole;
  } catch (error) {
    console.error("Error syncing user role:", error);
    return null;
  }
}

/**
 * Check if a user has a specific role
 */
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const [role] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, roleName))

    if (!role) return false

    // Get user's database ID first
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))

    if (!dbUser) return false;

    const [userRole] = await db
      .select()
      .from(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, dbUser.id),
          eq(userRolesTable.roleId, role.id)
        )
      )

    return !!userRole
  } catch (error) {
    console.error("Error checking role:", error)
    return false
  }
}

/**
 * Check if a user has access to a specific tool
 */
export async function hasToolAccess(userId: string, toolIdentifier: string): Promise<boolean> {
  try {
    // Get user's database ID
    const dbUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))
    
    if (!dbUsers.length || !dbUsers[0]) {
      return false
    }
    
    const dbUser = dbUsers[0]

    // Check if tool exists and is active
    const tools = await db
      .select()
      .from(toolsTable)
      .where(
        and(
          eq(toolsTable.identifier, toolIdentifier),
          eq(toolsTable.isActive, true)
        )
      )
    
    if (!tools.length || !tools[0]) {
      return false
    }
    
    const tool = tools[0]

    // Check if any of user's roles have access to the tool
    const userRoles = await db
      .select()
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, dbUser.id))
    
    if (!userRoles.length) {
      return false
    }

    const roleIds = userRoles.map(r => r.roleId)

    const roleTools = await db
      .select()
      .from(roleToolsTable)
      .where(
        and(
          eq(roleToolsTable.toolId, tool.id),
          inArray(roleToolsTable.roleId, roleIds)
        )
      )
    
    const hasAccess = roleTools.length > 0
    
    return hasAccess
  } catch (error) {
    console.error("Error checking tool access for %s to %s:", userId, toolIdentifier, error)
    return false
  }
}

/**
 * Get all tools a user has access to
 */
export async function getUserTools(userId: string): Promise<string[]> {
  try {
    if (!userId) {
      return [];
    }

    // First, get the user by their Clerk ID
    const dbUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId));
    
    if (!dbUsers.length) {
      return [];
    }
    
    const dbUser = dbUsers[0];

    // Get user's roles from user_roles table
    const userRoles = await db
      .select({
        roleId: userRolesTable.roleId
      })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, dbUser.id));

    if (!userRoles.length) {
      return [];
    }
    
    // Extract role IDs
    const roleIds = userRoles.map(ur => ur.roleId);
    
    // Find all tools associated with any of the user's roles
    const roleTools = await db
      .select({
        toolIdentifier: toolsTable.identifier
      })
      .from(roleToolsTable)
      .innerJoin(toolsTable, eq(roleToolsTable.toolId, toolsTable.id))
      .where(and(
        inArray(roleToolsTable.roleId, roleIds),
        eq(toolsTable.isActive, true)
      ));
    
    // Extract unique tool identifiers
    const tools = [...new Set(roleTools.map(rt => rt.toolIdentifier))];
    
    return tools;
  } catch (error) {
    console.error("Error fetching user tools:", error);
    return [];
  }
}

/**
 * Get all roles a user has
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    // Get user's database ID first
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))

    if (!dbUser) return []

    // Get all roles the user has from user_roles table
    const userRoleRecords = await db
      .select({
        name: rolesTable.name
      })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, dbUser.id))

    return userRoleRecords.map(r => r.name)
  } catch (error) {
    console.error("Error getting user roles:", error)
    return []
  }
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(userId: string, roles: string[]): Promise<boolean> {
  try {
    const userRoles = await getUserRoles(userId)
    return roles.some(role => userRoles.includes(role))
  } catch (error) {
    console.error("Error checking if user has any role:", error)
    return false
  }
}

/**
 * Get the highest role a user has based on hierarchy
 */
export async function getHighestUserRole(userId: string): Promise<string | null> {
  try {
    const userRoles = await getUserRoles(userId)
    if (!userRoles.length) return null
    
    // Find the highest role based on the hierarchy
    let highestRole = userRoles[0]
    let highestRank = roleHierarchy[highestRole as keyof typeof roleHierarchy] || -1
    
    for (const role of userRoles) {
      const rank = roleHierarchy[role as keyof typeof roleHierarchy] || -1
      if (rank > highestRank) {
        highestRole = role
        highestRank = rank
      }
    }
    
    return highestRole
  } catch (error) {
    console.error("Error getting highest user role:", error)
    return null
  }
} 