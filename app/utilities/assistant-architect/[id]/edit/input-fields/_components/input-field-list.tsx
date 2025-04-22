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

  function getDisplayType(type: string) {
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
    <div className="rounded-md border">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground w-1/3">Name</th>
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground w-1/3">Type</th>
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">Position</th>
              <th className="h-12 px-6 text-right align-middle font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {inputFields.map((field, index) => (
              <tr
                key={field.id}
                className={cn(
                  "border-b transition-colors",
                  index % 2 === 0 ? "bg-white" : "bg-muted/10",
                  "hover:bg-muted/20"
                )}
              >
                <td className="p-6 align-middle font-medium">{field.name || "-"}</td>
                <td className="p-6 align-middle">
                  {field.fieldType ? getDisplayType(field.fieldType) : "-"}
                </td>
                <td className="p-6 align-middle">{field.position ?? "-"}</td>
                <td className="p-6 align-middle text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(field)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(field)}
                      disabled={isDeleting === field.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {isDeleting === field.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
} 