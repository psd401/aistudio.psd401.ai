"use server"

import { db } from "@/db/query"
import { navigationItemsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq, isNull } from "drizzle-orm"
import { hasRole } from "@/utils/roles"
import type { InsertNavigationItem, SelectNavigationItem } from "@/db/schema"

export async function getNavigationItemsAction(): Promise<ActionState<SelectNavigationItem[]>> {
  try {
    const items = await db
      .select()
      .from(navigationItemsTable)
      .orderBy(navigationItemsTable.position)
    
    return {
      isSuccess: true,
      message: "Navigation items retrieved successfully",
      data: items
    }
  } catch (error) {
    console.error("Error getting navigation items:", error)
    return { isSuccess: false, message: "Failed to get navigation items" }
  }
}

export async function createNavigationItemAction(
  data: InsertNavigationItem
): Promise<ActionState<SelectNavigationItem>> {
  try {
    const [newItem] = await db
      .insert(navigationItemsTable)
      .values(data)
      .returning()
    
    return {
      isSuccess: true,
      message: "Navigation item created successfully",
      data: newItem
    }
  } catch (error) {
    console.error("Error creating navigation item:", error)
    return { isSuccess: false, message: "Failed to create navigation item" }
  }
}

export async function updateNavigationItemAction(
  id: string,
  data: Partial<InsertNavigationItem>
): Promise<ActionState<SelectNavigationItem>> {
  try {
    const [updatedItem] = await db
      .update(navigationItemsTable)
      .set(data)
      .where(eq(navigationItemsTable.id, id))
      .returning()
    
    return {
      isSuccess: true,
      message: "Navigation item updated successfully",
      data: updatedItem
    }
  } catch (error) {
    console.error("Error updating navigation item:", error)
    return { isSuccess: false, message: "Failed to update navigation item" }
  }
}

export async function deleteNavigationItemAction(
  id: string
): Promise<ActionState<void>> {
  try {
    await db
      .delete(navigationItemsTable)
      .where(eq(navigationItemsTable.id, id))
    
    return {
      isSuccess: true,
      message: "Navigation item deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting navigation item:", error)
    return { isSuccess: false, message: "Failed to delete navigation item" }
  }
} 