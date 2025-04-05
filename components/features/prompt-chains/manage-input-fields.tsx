"use client"

import { useState, useEffect } from "react"
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  rectIntersection,
  useSensor, 
  useSensors 
} from "@dnd-kit/core"
import { 
  SortableContext, 
  arrayMove, 
  rectSortingStrategy 
} from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InputFieldForm } from "@/components/features/prompt-chains/input-field-form"
import { EditInputFieldForm } from "@/components/features/prompt-chains/edit-input-field-form"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { Trash2, Edit, GripVertical } from "lucide-react"
import { deleteInputFieldAction, reorderInputFieldsAction } from "@/actions/db/prompt-chains-actions"
import type { PromptChainToolWithRelations } from "@/types"
import { SortableInputField } from "./sortable-input-field"
import { cn } from "@/lib/utils"

interface ManageInputFieldsProps {
  tool: PromptChainToolWithRelations
  canEdit: boolean
}

export function ManageInputFields({ tool, canEdit }: ManageInputFieldsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [fields, setFields] = useState(tool.inputFields || [])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  
  // Update fields when tool.inputFields changes
  useEffect(() => {
    setFields(tool.inputFields || [])
  }, [tool.inputFields])
  
  // Configure drag sensor with a minimum distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
  
  // Sort input fields by position
  const sortedFields = [...fields].sort(
    (a, b) => a.position - b.position
  )

  const handleSuccess = () => {
    router.refresh()
  }

  const handleDeleteField = async (fieldId: string) => {
    try {
      setIsDeleting(fieldId)
      const result = await deleteInputFieldAction(fieldId)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Input field deleted successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete input field",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sortedFields.findIndex((field) => field.id === active.id)
      const newIndex = sortedFields.findIndex((field) => field.id === over.id)

      const newFields = arrayMove(sortedFields, oldIndex, newIndex).map((field, index) => ({
        ...field,
        position: index
      }))
      
      // Update local state immediately for smooth UI
      setFields(newFields)
      setIsReordering(true)

      try {
        const result = await reorderInputFieldsAction(
          tool.id,
          newFields.map((field) => ({
            id: field.id,
            position: field.position
          }))
        )

        if (!result.isSuccess) {
          throw new Error(result.message)
        }

        // Update the local state with the new positions
        setFields(newFields)

        toast({
          title: "Success",
          description: "Input fields reordered successfully"
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to reorder input fields",
          variant: "destructive"
        })
        // Revert to original order
        setFields(tool.inputFields || [])
      } finally {
        setIsReordering(false)
      }
    }

    setActiveId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Input Fields</h3>
        {canEdit && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add Input Field</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Input Field</DialogTitle>
              </DialogHeader>
              <InputFieldForm 
                toolId={tool.id} 
                currentPosition={sortedFields.length}
                onSuccess={() => {
                  setIsAddOpen(false)
                  handleSuccess()
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sortedFields.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No input fields have been added yet. 
              {canEdit && " Click 'Add Input Field' to create one."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedFields.map(field => field.id)} strategy={rectSortingStrategy}>
            <div className={cn(
              "grid gap-4 md:grid-cols-2",
              isReordering && "cursor-wait"
            )}>
              {sortedFields.map((field) => (
                <SortableInputField
                  key={field.id}
                  field={field}
                  canEdit={canEdit && !isReordering}
                  isDeleting={isDeleting === field.id}
                  isEditing={isEditOpen === field.id}
                  onEdit={() => setIsEditOpen(field.id)}
                  onEditClose={() => setIsEditOpen(null)}
                  onDelete={() => handleDeleteField(field.id)}
                  onSuccess={handleSuccess}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              <Card className="w-full md:w-[calc(50%-0.5rem)] opacity-80 rotate-2 border-2 border-primary/50 shadow-xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-accent text-accent-foreground">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-lg">
                        {fields.find(field => field.id === activeId)?.name}
                      </CardTitle>
                    </div>
                    <Badge variant="outline">
                      {(fields.find(field => field.id === activeId)?.position || 0) + 1}
                    </Badge>
                  </div>
                  <CardDescription>
                    Type: {fields.find(field => field.id === activeId)?.fieldType.replace("_", " ")}
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
} 