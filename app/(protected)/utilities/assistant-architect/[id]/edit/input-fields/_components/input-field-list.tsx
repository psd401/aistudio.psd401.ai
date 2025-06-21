"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SelectToolInputField } from "@/types"
import { deleteInputFieldAction } from "@/actions/db/assistant-architect-actions"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"

interface InputFieldListProps {
  assistantId: string
  inputFields: SelectToolInputField[]
  onEdit: (field: SelectToolInputField) => void
}

export function InputFieldList({ assistantId, inputFields, onEdit }: InputFieldListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  async function handleDelete(field: SelectToolInputField) {
    try {
      setIsDeleting(field.id)
      const result = await deleteInputFieldAction(field.id)
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

  function getDisplayType(type: string | undefined) {
    if (!type) return "Unknown";
    return type.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ")
  }

  if (inputFields.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        No input fields added yet
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {inputFields.map((field) => (
        <div
          key={field.id}
          className="flex items-center justify-between p-4 border rounded-lg bg-card"
        >
          <div className="space-y-1">
            <div className="font-medium">{field.label || field.name}</div>
            <div className="text-sm text-muted-foreground">
              Type: {getDisplayType(field.fieldType || field.field_type)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(field)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(field)}
              disabled={isDeleting === field.id}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
} 