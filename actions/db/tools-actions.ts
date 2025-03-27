"use server"

import { db } from "@/db/query"
import { toolsTable, roleToolsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import type { InsertTool, SelectTool } from "@/db/schema"

export async function createToolAction(
  tool: InsertTool
): Promise<ActionState<SelectTool>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    const [newTool] = await db.insert(toolsTable).values(tool).returning()

    return {
      isSuccess: true,
      message: "Tool created successfully",
      data: newTool
    }
  } catch (error) {
    console.error("Error creating tool:", error)
    return { isSuccess: false, message: "Failed to create tool" }
  }
}

export async function getToolsAction(): Promise<ActionState<SelectTool[]>> {
  try {
    const tools = await db.select().from(toolsTable)
    return {
      isSuccess: true,
      message: "Tools retrieved successfully",
      data: tools
    }
  } catch (error) {
    console.error("Error getting tools:", error)
    return { isSuccess: false, message: "Failed to get tools" }
  }
}

export async function getToolByIdAction(id: number): Promise<ActionState<SelectTool>> {
  try {
    const [tool] = await db
      .select()
      .from(toolsTable)
      .where(eq(toolsTable.id, id))

    if (!tool) {
      return { isSuccess: false, message: "Tool not found" }
    }

    return {
      isSuccess: true,
      message: "Tool retrieved successfully",
      data: tool
    }
  } catch (error) {
    console.error("Error getting tool:", error)
    return { isSuccess: false, message: "Failed to get tool" }
  }
}

export async function updateToolAction(
  id: number,
  data: Partial<InsertTool>
): Promise<ActionState<SelectTool>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    const [updatedTool] = await db
      .update(toolsTable)
      .set(data)
      .where(eq(toolsTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Tool updated successfully",
      data: updatedTool
    }
  } catch (error) {
    console.error("Error updating tool:", error)
    return { isSuccess: false, message: "Failed to update tool" }
  }
}

export async function deleteToolAction(id: number): Promise<ActionState<void>> {
  try {
    const { userId } = auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return { isSuccess: false, message: "Forbidden" }
    }

    await db.transaction(async (tx) => {
      // Delete role tool assignments
      await tx.delete(roleToolsTable).where(eq(roleToolsTable.toolId, id))
      
      // Delete the tool
      await tx.delete(toolsTable).where(eq(toolsTable.id, id))
    })

    return {
      isSuccess: true,
      message: "Tool deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting tool:", error)
    return { isSuccess: false, message: "Failed to delete tool" }
  }
} 