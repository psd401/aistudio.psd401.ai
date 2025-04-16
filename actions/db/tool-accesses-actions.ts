"use server"

import { db } from "@/db/db"
import { toolAccessesTable, toolsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq, and } from "drizzle-orm"

export async function grantToolAccessToUserAction(
  userId: string,
  toolId: string
): Promise<ActionState<void>> {
  try {
    // Check if the tool exists and is active
    const tool = await db.query.tools.findFirst({
      where: eq(toolsTable.id, toolId),
    })

    if (!tool) {
      return {
        isSuccess: false,
        message: "Tool not found",
      }
    }

    if (!tool.isActive) {
      return {
        isSuccess: false,
        message: "Cannot grant access to inactive tool",
      }
    }

    // Check if access already exists
    const existingAccess = await db.query.toolAccesses.findFirst({
      where: and(
        eq(toolAccessesTable.userId, userId),
        eq(toolAccessesTable.toolId, toolId)
      ),
    })

    if (existingAccess) {
      return {
        isSuccess: true,
        message: "User already has access to this tool",
        data: undefined,
      }
    }

    // Grant access
    await db.insert(toolAccessesTable).values({
      userId,
      toolId,
    })

    return {
      isSuccess: true,
      message: "Tool access granted successfully",
      data: undefined,
    }
  } catch (error) {
    console.error("Error granting tool access:", error)
    return { isSuccess: false, message: "Failed to grant tool access" }
  }
}

export async function revokeToolAccessFromUserAction(
  userId: string,
  toolId: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(toolAccessesTable)
      .where(
        and(
          eq(toolAccessesTable.userId, userId),
          eq(toolAccessesTable.toolId, toolId)
        )
      )

    return {
      isSuccess: true,
      message: "Tool access revoked successfully",
      data: undefined,
    }
  } catch (error) {
    console.error("Error revoking tool access:", error)
    return { isSuccess: false, message: "Failed to revoke tool access" }
  }
}

export async function getUserToolAccessesAction(
  userId: string
): Promise<ActionState<string[]>> {
  try {
    const toolAccesses = await db.query.toolAccesses.findMany({
      where: eq(toolAccessesTable.userId, userId),
      columns: {
        toolId: true,
      },
    })

    return {
      isSuccess: true,
      message: "User tool accesses retrieved successfully",
      data: toolAccesses.map(access => access.toolId),
    }
  } catch (error) {
    console.error("Error retrieving user tool accesses:", error)
    return { isSuccess: false, message: "Failed to retrieve user tool accesses" }
  }
}

export async function getToolUserAccessesAction(
  toolId: string
): Promise<ActionState<string[]>> {
  try {
    const toolAccesses = await db.query.toolAccesses.findMany({
      where: eq(toolAccessesTable.toolId, toolId),
      columns: {
        userId: true,
      },
    })

    return {
      isSuccess: true,
      message: "Tool user accesses retrieved successfully",
      data: toolAccesses.map(access => access.userId),
    }
  } catch (error) {
    console.error("Error retrieving tool user accesses:", error)
    return { isSuccess: false, message: "Failed to retrieve tool user accesses" }
  }
}

export async function hasDirectToolAccessAction(
  userId: string,
  toolId: string
): Promise<ActionState<boolean>> {
  try {
    const access = await db.query.toolAccesses.findFirst({
      where: and(
        eq(toolAccessesTable.userId, userId),
        eq(toolAccessesTable.toolId, toolId)
      ),
    })

    return {
      isSuccess: true,
      message: "Tool access check completed",
      data: !!access,
    }
  } catch (error) {
    console.error("Error checking tool access:", error)
    return { isSuccess: false, message: "Failed to check tool access" }
  }
} 