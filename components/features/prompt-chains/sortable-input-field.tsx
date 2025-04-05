import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
import { EditInputFieldForm } from "@/components/features/prompt-chains/edit-input-field-form"
import { GripVertical, Edit, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SelectToolInputField } from "@/db/schema"

interface SortableInputFieldProps {
  field: SelectToolInputField
  canEdit: boolean
  isDeleting: boolean
  isEditing: boolean
  onEdit: () => void
  onEditClose: () => void
  onDelete: () => void
  onSuccess: () => void
}

export function SortableInputField({
  field,
  canEdit,
  isDeleting,
  isEditing,
  onEdit,
  onEditClose,
  onDelete,
  onSuccess
}: SortableInputFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drop indicator line */}
      <div 
        className={cn(
          "absolute -top-1 left-0 right-0 h-[2px] bg-primary/50 opacity-0 transition-opacity",
          isOver && "opacity-100"
        )} 
      />
      <Card
        className={cn(
          "transition-all border-2 border-transparent",
          isDragging ? "rotate-2 scale-105 shadow-lg !border-primary/50" : "hover:border-primary/20",
          canEdit && "cursor-grab active:cursor-grabbing group",
          isOver && "scale-[0.98] transition-transform"
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canEdit && (
                <div
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    "group-hover:bg-accent/50 group-hover:text-accent-foreground",
                    isDragging && "bg-accent text-accent-foreground"
                  )}
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
              <CardTitle className="text-lg">{field.name}</CardTitle>
            </div>
            <Badge variant="outline">{field.position + 1}</Badge>
          </div>
          <CardDescription>
            Type: {field.fieldType.replace("_", " ")}
          </CardDescription>
          <div className="mt-1 font-mono text-xs text-muted-foreground">ID: {field.id}</div>
        </CardHeader>
        <CardContent>
          {field.options && field.options.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Options:</p>
              <div className="flex flex-wrap gap-2">
                {field.options.map((option, i) => (
                  <Badge key={i} variant="secondary">{option.label}</Badge>
                ))}
              </div>
            </div>
          )}
          
          {canEdit && (
            <div className="flex justify-end mt-4 gap-2">
              <Dialog open={isEditing} onOpenChange={(open) => open ? onEdit() : onEditClose()}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Edit Input Field</DialogTitle>
                  </DialogHeader>
                  <EditInputFieldForm 
                    field={field}
                    onSuccess={() => {
                      onEditClose()
                      onSuccess()
                    }}
                  />
                </DialogContent>
              </Dialog>

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                onClick={onDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Drop indicator line */}
      <div 
        className={cn(
          "absolute -bottom-1 left-0 right-0 h-[2px] bg-primary/50 opacity-0 transition-opacity",
          isOver && "opacity-100"
        )} 
      />
    </div>
  )
} 