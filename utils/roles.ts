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
  // Get user from database
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userId));

  // Get user from Clerk
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const clerkRole = clerkUser.publicMetadata.role as Role | undefined;

  // If user exists in DB but not in Clerk, sync DB -> Clerk
  if (dbUser && !clerkRole) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: dbUser.role,
      },
    });
    return dbUser.role;
  }

  // If user exists in Clerk but not in DB, sync Clerk -> DB
  if (!dbUser && clerkRole) {
    const [newUser] = await db
      .insert(usersTable)
      .values({
        clerkId: userId,
        role: clerkRole,
      })
      .returning();
    return newUser.role;
  }

  // If user exists in both places but roles don't match, prefer DB
  if (dbUser && clerkRole && dbUser.role !== clerkRole) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: dbUser.role,
      },
    });
    return dbUser.role;
  }

  return dbUser?.role;
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const [role] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, roleName))

    if (!role) return false

    const [userRole] = await db
      .select()
      .from(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, role.id)
        )
      )

    return !!userRole
  } catch (error) {
    console.error("Error checking role:", error)
    return false
  }
}

export async function hasExactRole(userId: string, role: Role): Promise<boolean> {
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userId));

  return dbUser?.role?.toLowerCase() === role.toLowerCase();
}

/**
 * Check if a user has access to a specific tool
 */
export async function hasToolAccess(userId: string, toolIdentifier: string): Promise<boolean> {
  try {
    // Get user's database ID
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))

    if (!dbUser) return false

    // Get tool
    const [tool] = await db
      .select()
      .from(toolsTable)
      .where(eq(toolsTable.id, toolIdentifier))

    if (!tool || !tool.isActive) return false

    // Get user's roles
    const userRoles = await db
      .select({
        roleId: userRolesTable.roleId
      })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, dbUser.id))

    if (!userRoles.length) return false

    // Check if any of user's roles have access to the tool
    const roleIds = userRoles.map(ur => ur.roleId)
    const [roleToolAccess] = await db
      .select()
      .from(roleToolsTable)
      .where(
        and(
          inArray(roleToolsTable.roleId, roleIds),
          eq(roleToolsTable.toolId, tool.id)
        )
      )

    return !!roleToolAccess
  } catch (error) {
    console.error("Error checking tool access:", error)
    return false
  }
}

/**
 * Get all tools a user has access to
 */
export async function getUserTools(userId: string): Promise<string[]> {
  try {
    // Get user's database ID first
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))

    if (!dbUser) return []

    // Get user's roles
    const userRoles = await db
      .select({
        roleId: userRolesTable.roleId
      })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, dbUser.id))

    if (!userRoles.length) return []

    // Get all tools accessible by user's roles
    const roleIds = userRoles.map(ur => ur.roleId)
    const tools = await db
      .select({
        identifier: toolsTable.identifier
      })
      .from(roleToolsTable)
      .innerJoin(toolsTable, eq(roleToolsTable.toolId, toolsTable.id))
      .where(
        and(
          inArray(roleToolsTable.roleId, roleIds),
          eq(toolsTable.isActive, true)
        )
      )

    return [...new Set(tools.map(t => t.identifier))]
  } catch (error) {
    console.error("Error getting user tools:", error)
    return []
  }
} 