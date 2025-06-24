"use server"

import { 
  checkUserRole, 
  hasToolAccess as dbHasToolAccess, 
  getUserTools as dbGetUserTools,
  getUserIdByCognitoSub,
  getUserRolesByCognitoSub as dbGetUserRolesByCognitoSub
} from "@/lib/db/data-api-adapter";
import { getServerSession } from "@/lib/auth/server-session";
import type { Role } from '@/types';

const roleHierarchy: Record<Role, number> = {
  student: 0,
  staff: 1,
  administrator: 2
};

/**
 * Check if a user has a specific role
 */
export async function hasRole(roleName: string): Promise<boolean> {
  const session = await getServerSession();
  if (!session) return false;
  
  const userId = await getUserIdByCognitoSub(session.sub);
  if (!userId) return false;
  
  return checkUserRole(userId, roleName);
}

/**
 * Check if a user has access to a specific tool
 */
export async function hasToolAccess(toolIdentifier: string): Promise<boolean> {
  const session = await getServerSession();
  if (!session) return false;
  
  return dbHasToolAccess(session.sub, toolIdentifier);
}

/**
 * Get all tools a user has access to
 */
export async function getUserTools(): Promise<string[]> {
  const session = await getServerSession();
  if (!session) return [];
  
  return dbGetUserTools(session.sub);
}

/**
 * Get all roles a user has
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    // Get cognito sub for the userId
    const session = await getServerSession();
    if (!session) return [];
    
    // Note: This function expects a userId but getUserRolesByCognitoSub expects a cognito sub
    // For now, assuming userId is the cognito sub (this may need adjustment based on usage)
    return await dbGetUserRolesByCognitoSub(userId);
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

export async function syncUserRole(userId: string, role: string): Promise<void> {
  // This is now handled by the database directly
  // Role sync happens through user_roles table
  throw new Error("syncUserRole is deprecated - use user_roles table directly");
} 