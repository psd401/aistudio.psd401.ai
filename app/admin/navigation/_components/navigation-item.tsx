"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { SelectNavigationItem } from "@/db/schema"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { GripVertical, Pencil, Trash, ChevronRight, ChevronDown } from "lucide-react"
import { NavigationItemForm } from "./navigation-item-form"
import { useState } from "react"
import { deleteNavigationItemAction } from "@/actions/db/navigation-actions"
import { iconMap } from "@/components/navigation/icon-map"
import React from "react"

interface NavigationItemProps {
  /** The navigation item to render */
  item: SelectNavigationItem
  /** Callback function to trigger after updates */
  onUpdate: () => void
  /** Whether the section is collapsed (only applicable for section type items) */
  isCollapsed?: boolean
  /** Callback function to toggle section collapse state */
  onToggleCollapse?: () => void
}

/**
 * Navigation Item Component
 * 
 * Renders a draggable navigation item with the following features:
 * - Drag handle for reordering
 * - Icon display based on item type
 * - Collapse/expand functionality for sections
 * - Edit and delete actions
 * - Visual feedback during drag operations
 */
export function NavigationItem({ 
  item, 
  onUpdate, 
  isCollapsed = false,
  onToggleCollapse 
}: NavigationItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  
  // Configure drag-and-drop functionality
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  /**
   * Handles item deletion with confirmation
   */
  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this navigation item?")) {
      await deleteNavigationItemAction(item.id)
      onUpdate()
    }
  }

  // Get the icon component from the icon map, fallback to home icon
  const IconComponent = iconMap[item.icon] || iconMap.IconHome

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className="p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          {/* Drag handle */}
          <Button
            variant="ghost"
            className="cursor-grab p-1 h-auto"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-3">
            {/* Collapse/expand button for sections */}
            {item.type === 'section' && onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleCollapse}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Item icon */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background">
              {React.createElement(IconComponent, { className: "h-4 w-4" })}
            </div>

            {/* Item details */}
            <div>
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-muted-foreground">
                {item.type} {item.parentId ? "• Child Item" : "• Top Level"}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Edit form dialog */}
      <NavigationItemForm
        open={isEditing}
        onOpenChange={setIsEditing}
        onSubmit={onUpdate}
        initialData={item}
      />
    </>
  )
} 