"use client"

import { useState, useEffect } from "react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { NavigationItem } from "./navigation-item"
import { NavigationItemForm } from "./navigation-item-form"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { SelectNavigationItem } from "@/db/schema"
import { updateNavigationItemAction } from "@/actions/db/navigation-actions"

interface OrganizedItem extends SelectNavigationItem {
  children: OrganizedItem[]
  level: number
}

/**
 * Organizes navigation items into a hierarchical structure
 * @param items - Flat array of navigation items
 * @param parentId - ID of the parent item (null for top-level items)
 * @param level - Current nesting level (used for indentation)
 * @returns Array of organized items with their children
 */
function organizeItems(items: SelectNavigationItem[], parentId: string | null = null, level: number = 0): OrganizedItem[] {
  const filteredItems = items
    .filter(item => item.parentId === parentId)
    .sort((a, b) => (a.position || 0) - (b.position || 0))

  return filteredItems.map(item => ({
    ...item,
    children: organizeItems(items, item.id, level + 1),
    level
  }))
}

/**
 * Flattens a hierarchical structure of items while preserving level information
 * @param items - Array of organized items with children
 * @returns Flat array of items with level information
 */
function flattenOrganizedItems(items: OrganizedItem[]): OrganizedItem[] {
  return items.reduce((flat: OrganizedItem[], item) => {
    return [...flat, item, ...flattenOrganizedItems(item.children)]
  }, [])
}

/**
 * Navigation Manager Component
 * 
 * Provides a drag-and-drop interface for managing navigation items with features:
 * - Hierarchical organization with sections and child items
 * - Collapsible sections for better organization
 * - Position management within parent groups
 * - Real-time updates to the database
 */
export function NavigationManager() {
  const [items, setItems] = useState<SelectNavigationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Configure drag sensor with a minimum distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Fetch initial navigation items
  useEffect(() => {
    const fetchNavigation = async () => {
      try {
        const response = await fetch("/api/admin/navigation")
        const data = await response.json()
        if (data.isSuccess) {
          setItems(data.data)
        }
      } catch (error) {
        console.error("Failed to fetch navigation:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchNavigation()
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  /**
   * Handles the end of a drag operation
   * - Updates positions of items within the same parent group
   * - Uses increments of 10 for positions to allow for future insertions
   * - Maintains parent-child relationships
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      // Get the dragged item and its parent ID
      const draggedItem = items[oldIndex]
      const targetItem = items[newIndex]
      
      // Only allow reordering within the same parent group
      if (draggedItem.parentId !== targetItem.parentId) {
        return;
      }

      const newItems = arrayMove(items, oldIndex, newIndex)
      
      try {
        // Get all items with the same parent
        const siblingItems = newItems.filter(item => 
          item.parentId === draggedItem.parentId
        )

        // Update positions for all items in the same group
        const updates = siblingItems.map((item, index) => 
          fetch('/api/admin/navigation', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: item.id,
              position: index * 10
            }),
          }).then(res => res.json())
        )
        
        await Promise.all(updates)

        // Refresh the list to ensure we have the latest data
        const response = await fetch("/api/admin/navigation")
        const data = await response.json()
        if (data.isSuccess) {
          setItems(data.data)
        }
      } catch (error) {
        console.error('Failed to update positions:', error)
      }
    }

    setActiveId(null)
  }

  /**
   * Refreshes the navigation items list after form submission
   */
  const handleFormSubmit = async () => {
    const response = await fetch("/api/admin/navigation")
    const data = await response.json()
    if (data.isSuccess) {
      setItems(data.data)
    }
    setIsFormOpen(false)
  }

  /**
   * Toggles the collapsed state of a section
   */
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  // Organize items hierarchically and filter based on collapsed state
  const organizedItems = organizeItems(items)
  const flattenedItems = flattenOrganizedItems(organizedItems).filter(item => {
    // Always show top-level items
    if (!item.parentId) return true
    // For child items, check if parent section is expanded
    const parentSection = items.find(i => i.id === item.parentId)
    return parentSection && !collapsedSections.has(parentSection.id)
  })

  return (
    <div className="space-y-6">
      <Button onClick={() => setIsFormOpen(true)} className="mb-4">
        <Plus className="h-4 w-4 mr-2" />
        Add Navigation Item
      </Button>

      <NavigationItemForm 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleFormSubmit}
        items={items}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={flattenedItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {flattenedItems.map((item) => (
              <div
                key={item.id}
                className="transition-all"
                style={{ paddingLeft: `${item.level * 1.5}rem` }}
              >
                <NavigationItem
                  item={item}
                  onUpdate={handleFormSubmit}
                  isCollapsed={item.type === 'section' && collapsedSections.has(item.id)}
                  onToggleCollapse={() => item.type === 'section' && toggleSection(item.id)}
                />
              </div>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="bg-background border rounded-lg p-4 shadow-lg">
              {items.find(item => item.id === activeId)?.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
} 