"use server"

import { 
  getNavigationItems, 
  createNavigationItem, 
  updateNavigationItem, 
  deleteNavigationItem
} from "@/lib/db/data-api-adapter"
import { ActionState } from "@/types"
import type { InsertNavigationItem, SelectNavigationItem } from "@/types/db-types"
import logger from "@/lib/logger"
// UUID import removed - using auto-increment IDs

export async function getNavigationItemsAction(): Promise<ActionState<SelectNavigationItem[]>> {
  try {
    const items = await getNavigationItems(false) // Get all items, not just active
    
    return {
      isSuccess: true,
      message: "Navigation items retrieved successfully",
      data: items as unknown as SelectNavigationItem[]
    }
  } catch (error) {
    logger.error("Error getting navigation items:", error)
    return { isSuccess: false, message: "Failed to get navigation items" }
  }
}

export async function createNavigationItemAction(
  data: InsertNavigationItem
): Promise<ActionState<SelectNavigationItem>> {
  try {
    const newItem = await createNavigationItem({
      label: data.label,
      icon: data.icon,
      link: data.link ?? undefined,
      description: data.description ?? undefined,
      type: data.type || 'page',
      parentId: data.parentId ? Number(data.parentId) : undefined,
      toolId: data.toolId ? Number(data.toolId) : undefined,
      requiresRole: data.requiresRole ?? undefined,
      position: data.position,
      isActive: data.isActive ?? true
    })
    
    return {
      isSuccess: true,
      message: "Navigation item created successfully",
      data: newItem as unknown as SelectNavigationItem
    }
  } catch (error) {
    logger.error("Error creating navigation item:", error)
    return { isSuccess: false, message: "Failed to create navigation item" }
  }
}

export async function updateNavigationItemAction(
  id: string | number,
  data: Partial<InsertNavigationItem>
): Promise<ActionState<SelectNavigationItem>> {
  try {
    // Convert null values to undefined for updateNavigationItem
    const updateData: Partial<{
      label: string;
      icon: string;
      link: string;
      description: string;
      type: string;
      parentId: number;
      toolId: number;
      requiresRole: string;
      position: number;
      isActive: boolean;
    }> = {}
    
    if (data.label !== undefined) updateData.label = data.label
    if (data.icon !== undefined) updateData.icon = data.icon
    if (data.link !== undefined && data.link !== null) updateData.link = data.link
    if (data.description !== undefined && data.description !== null) updateData.description = data.description
    if (data.type !== undefined) updateData.type = data.type
    if (data.parentId !== undefined && data.parentId !== null) updateData.parentId = data.parentId
    if (data.toolId !== undefined && data.toolId !== null) updateData.toolId = data.toolId
    if (data.requiresRole !== undefined && data.requiresRole !== null) updateData.requiresRole = data.requiresRole
    if (data.position !== undefined) updateData.position = data.position
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    
    const updatedItem = await updateNavigationItem(Number(id), updateData)
    
    return {
      isSuccess: true,
      message: "Navigation item updated successfully",
      data: updatedItem as unknown as SelectNavigationItem
    }
  } catch (error) {
    logger.error("Error updating navigation item:", error)
    return { isSuccess: false, message: "Failed to update navigation item" }
  }
}

export async function deleteNavigationItemAction(
  id: string | number
): Promise<ActionState<void>> {
  try {
    await deleteNavigationItem(Number(id))
    
    return {
      isSuccess: true,
      message: "Navigation item deleted successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error deleting navigation item:", error)
    return { isSuccess: false, message: "Failed to delete navigation item" }
  }
}