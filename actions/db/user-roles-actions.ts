"use server"

import { db } from "@/db/db"
import { userRolesTable, rolesTable, usersTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and, desc } from "drizzle-orm"
import { getServerSession } from "@/lib/auth/server-session"
import { hasRole } from "@/utils/roles"
import type { InsertUserRole, SelectUserRole, SelectRole, SelectUser } from "@/db/schema"
import logger from "@/lib/logger"

export async function assignRoleToUserAction(
  userId: number,
  roleId: number
): Promise<ActionState<SelectUserRole>> {
  try {
    const { userId: currentUserId } = getServerSession()
    if (!currentUserId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(currentUserId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if role exists
    const [role] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, roleId))

    if (!role) {
      return { isSuccess: false, message: "Role not found" }
    }

    // Check if user exists
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))

    if (!user) {
      return { isSuccess: false, message: "User not found" }
    }

    // Check if assignment already exists
    const [existingAssignment] = await db
      .select()
      .from(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, roleId)
        )
      )

    if (existingAssignment) {
      return { isSuccess: false, message: "User already has this role" }
    }

    const [newAssignment] = await db
      .insert(userRolesTable)
      .values({ userId, roleId })
      .returning()

    return {
      isSuccess: true,
      message: "Role assigned successfully",
      data: newAssignment
    }
  } catch (error) {
    logger.error("Error assigning role:", error)
    return { isSuccess: false, message: "Failed to assign role" }
  }
}

export async function removeRoleFromUserAction(
  userId: number,
  roleId: number
): Promise<ActionState<void>> {
  try {
    const { userId: currentUserId } = getServerSession()
    if (!currentUserId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(currentUserId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if assignment exists
    const [existingAssignment] = await db
      .select()
      .from(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, roleId)
        )
      )

    if (!existingAssignment) {
      return { isSuccess: false, message: "User does not have this role" }
    }

    await db
      .delete(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, roleId)
        )
      )

    return {
      isSuccess: true,
      message: "Role removed successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error removing role:", error)
    return { isSuccess: false, message: "Failed to remove role" }
  }
}

export async function getUserRolesAction(
  userId: number
): Promise<ActionState<SelectRole[]>> {
  try {
    const roles = await db
      .select({
        id: rolesTable.id,
        name: rolesTable.name,
        description: rolesTable.description,
        isSystem: rolesTable.isSystem,
        createdAt: rolesTable.createdAt,
        updatedAt: rolesTable.updatedAt
      })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, userId))

    return {
      isSuccess: true,
      message: "User roles retrieved successfully",
      data: roles
    }
  } catch (error) {
    logger.error("Error getting user roles:", error)
    return { isSuccess: false, message: "Failed to get user roles" }
  }
}

export async function getUsersByRoleAction(
  roleId: number
): Promise<ActionState<SelectUser[]>> {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        clerkId: usersTable.clerkId,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt
      })
      .from(userRolesTable)
      .innerJoin(usersTable, eq(userRolesTable.userId, usersTable.id))
      .where(eq(userRolesTable.roleId, roleId))

    return {
      isSuccess: true,
      message: "Users retrieved successfully",
      data: users
    }
  } catch (error) {
    logger.error("Error getting users by role:", error)
    return { isSuccess: false, message: "Failed to get users" }
  }
} 