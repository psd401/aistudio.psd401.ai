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
    
    // Transform to match expected format
    const transformedItems = items.map(item => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      link: item.link,
      parentId: item.parentId,
      description: item.description,
      type: item.type,
      toolId: item.toolId,
      requiresRole: item.requiresRole,
      position: item.position,
      isActive: item.isActive,
      createdAt: item.createdAt
    })) as SelectNavigationItem[]
    
    return {
      isSuccess: true,
      message: "Navigation items retrieved successfully",
      data: transformedItems
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
      link: data.link,
      description: data.description,
      type: data.type || 'page',
      parentId: data.parentId ? Number(data.parentId) : undefined,
      toolId: data.toolId ? Number(data.toolId) : undefined,
      requiresRole: data.requiresRole,
      position: data.position,
      isActive: data.isActive ?? true
    })
    
    // Transform to match expected format
    const transformedItem = {
      id: newItem.id,
      label: newItem.label,
      icon: newItem.icon,
      link: newItem.link,
      parentId: newItem.parentId,
      description: newItem.description,
      type: newItem.type,
      toolId: newItem.toolId,
      requiresRole: newItem.requiresRole,
      position: newItem.position,
      isActive: newItem.isActive,
      createdAt: newItem.createdAt
    } as SelectNavigationItem
    
    return {
      isSuccess: true,
      message: "Navigation item created successfully",
      data: transformedItem
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
    const updatedItem = await updateNavigationItem(Number(id), data)
    
    // Transform to match expected format
    const transformedItem = {
      id: updatedItem.id,
      label: updatedItem.label,
      icon: updatedItem.icon,
      link: updatedItem.link,
      parentId: updatedItem.parentId,
      description: updatedItem.description,
      type: updatedItem.type,
      toolId: updatedItem.toolId,
      requiresRole: updatedItem.requiresRole,
      position: updatedItem.position,
      isActive: updatedItem.isActive,
      createdAt: updatedItem.createdAt
    } as SelectNavigationItem
    
    return {
      isSuccess: true,
      message: "Navigation item updated successfully",
      data: transformedItem
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