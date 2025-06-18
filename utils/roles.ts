"use server"

import { 
  hasUserRole, 
  getUserRolesByClerkId, 
  hasToolAccess as dataApiHasToolAccess,
  getUserTools as dataApiGetUserTools 
} from '@/lib/db/data-api-adapter';
import type { Role } from '@/types';

const roleHierarchy: Record<Role, number> = {
  student: 0,
  staff: 1,
  administrator: 2
};

/**
 * Check if a user has a specific role
 */
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    return await hasUserRole(userId, roleName);
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
    return await dataApiHasToolAccess(userId, toolIdentifier);
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

    return await dataApiGetUserTools(userId);
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
    return await getUserRolesByClerkId(userId);
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