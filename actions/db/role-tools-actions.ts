"use server"

import { db } from "@/db/db"
import { roleToolsTable, rolesTable, toolsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import type { InsertRoleTool, SelectRoleTool, SelectTool, SelectRole } from "@/db/schema"

export async function assignToolToRoleAction(
  roleId: string,
  toolId: string
): Promise<ActionState<void>> {
  try {
    await db.insert(roleToolsTable).values({
      roleId,
      toolId
    })

    return {
      isSuccess: true,
      message: "Tool assigned to role successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error assigning tool to role:", error)
    return { isSuccess: false, message: "Failed to assign tool to role" }
  }
}

export async function removeToolFromRoleAction(
  roleId: string,
  toolId: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(roleToolsTable)
      .where(
        and(
          eq(roleToolsTable.roleId, roleId),
          eq(roleToolsTable.toolId, toolId)
        )
      )

    return {
      isSuccess: true,
      message: "Tool removed from role successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error removing tool from role:", error)
    return { isSuccess: false, message: "Failed to remove tool from role" }
  }
}

export async function getToolsForRoleAction(roleId: string) {
  try {
    const tools = await db
      .select({
        id: toolsTable.id,
        name: toolsTable.name,
        description: toolsTable.description,
        isActive: toolsTable.isActive
      })
      .from(roleToolsTable)
      .innerJoin(toolsTable, eq(roleToolsTable.toolId, toolsTable.id))
      .where(eq(roleToolsTable.roleId, roleId))

    return {
      isSuccess: true,
      message: "Tools retrieved successfully",
      data: tools
    }
  } catch (error) {
    console.error("Error getting tools for role:", error)
    return { isSuccess: false, message: "Failed to get tools for role" }
  }
}

export async function getRoleToolsAction(
  roleId: number
): Promise<ActionState<SelectTool[]>> {
  try {
    const tools = await db
      .select({
        id: toolsTable.id,
        name: toolsTable.name,
        description: toolsTable.description,
        identifier: toolsTable.identifier,
        isActive: toolsTable.isActive,
        createdAt: toolsTable.createdAt,
        updatedAt: toolsTable.updatedAt
      })
      .from(roleToolsTable)
      .innerJoin(toolsTable, eq(roleToolsTable.toolId, toolsTable.id))
      .where(eq(roleToolsTable.roleId, roleId))

    return {
      isSuccess: true,
      message: "Role tools retrieved successfully",
      data: tools
    }
  } catch (error) {
    console.error("Error getting role tools:", error)
    return { isSuccess: false, message: "Failed to get role tools" }
  }
}

export async function getToolRolesAction(
  toolId: number
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
      .from(roleToolsTable)
      .innerJoin(rolesTable, eq(roleToolsTable.roleId, rolesTable.id))
      .where(eq(roleToolsTable.toolId, toolId))

    return {
      isSuccess: true,
      message: "Tool roles retrieved successfully",
      data: roles
    }
  } catch (error) {
    console.error("Error getting tool roles:", error)
    return { isSuccess: false, message: "Failed to get tool roles" }
  }
} 