"use server"

import { db } from "@/db/db"
import { rolesTable, userRolesTable, roleToolsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import type { InsertRole, SelectRole } from "@/db/schema"

export async function createRoleAction(
  role: InsertRole
): Promise<ActionState<SelectRole>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    const [newRole] = await db.insert(rolesTable).values(role).returning()

    return {
      isSuccess: true,
      message: "Role created successfully",
      data: newRole
    }
  } catch (error) {
    console.error("Error creating role:", error)
    return { isSuccess: false, message: "Failed to create role" }
  }
}

export async function getRolesAction(): Promise<ActionState<SelectRole[]>> {
  try {
    const roles = await db.select().from(rolesTable)
    return {
      isSuccess: true,
      message: "Roles retrieved successfully",
      data: roles
    }
  } catch (error) {
    console.error("Error getting roles:", error)
    return { isSuccess: false, message: "Failed to get roles" }
  }
}

export async function getRoleByIdAction(id: number): Promise<ActionState<SelectRole>> {
  try {
    const [role] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))

    if (!role) {
      return { isSuccess: false, message: "Role not found" }
    }

    return {
      isSuccess: true,
      message: "Role retrieved successfully",
      data: role
    }
  } catch (error) {
    console.error("Error getting role:", error)
    return { isSuccess: false, message: "Failed to get role" }
  }
}

export async function updateRoleAction(
  id: number,
  data: Partial<InsertRole>
): Promise<ActionState<SelectRole>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if role exists and is not a system role
    const [existingRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))

    if (!existingRole) {
      return { isSuccess: false, message: "Role not found" }
    }

    if (existingRole.isSystem) {
      return { isSuccess: false, message: "Cannot modify system roles" }
    }

    const [updatedRole] = await db
      .update(rolesTable)
      .set(data)
      .where(eq(rolesTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Role updated successfully",
      data: updatedRole
    }
  } catch (error) {
    console.error("Error updating role:", error)
    return { isSuccess: false, message: "Failed to update role" }
  }
}

export async function deleteRoleAction(id: number): Promise<ActionState<void>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    // Check if role exists and is not a system role
    const [existingRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))

    if (!existingRole) {
      return { isSuccess: false, message: "Role not found" }
    }

    if (existingRole.isSystem) {
      return { isSuccess: false, message: "Cannot delete system roles" }
    }

    // Delete role and all associated records
    await db.transaction(async (tx) => {
      // Delete user role assignments
      await tx.delete(userRolesTable).where(eq(userRolesTable.roleId, id))
      
      // Delete role tool assignments
      await tx.delete(roleToolsTable).where(eq(roleToolsTable.roleId, id))
      
      // Delete the role
      await tx.delete(rolesTable).where(eq(rolesTable.id, id))
    })

    return {
      isSuccess: true,
      message: "Role deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting role:", error)
    return { isSuccess: false, message: "Failed to delete role" }
  }
} 