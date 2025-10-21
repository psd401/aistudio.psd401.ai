"use client"

import { Button } from "@/components/ui/button"
import { Trash2, X, Eye, EyeOff } from "lucide-react"
import { usePromptLibraryStore } from "@/lib/stores/prompt-library-store"
import { deletePrompt } from "@/actions/prompt-library.actions"
import { useAction } from "@/lib/hooks/use-action"
import { toast } from "sonner"

interface BulkActionsBarProps {
  selectedCount: number
  onClearSelection: () => void
  onDelete?: () => void
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onDelete
}: BulkActionsBarProps) {
  const { selectedPrompts } = usePromptLibraryStore()
  const { execute: executeDelete, isPending: isDeleting } = useAction(deletePrompt)

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} prompt(s)?`)) {
      const promises = Array.from(selectedPrompts).map((id) => executeDelete(id))
      const results = await Promise.all(promises)

      const successCount = results.filter(r => r?.isSuccess).length
      if (successCount > 0) {
        toast.success(`${successCount} prompt(s) deleted successfully`)
        onDelete?.()
        onClearSelection()
      } else {
        toast.error("Failed to delete prompts")
      }
    }
  }

  return (
    <div className="flex items-center justify-between border-b bg-muted px-6 py-3">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedCount} selected
        </span>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>

          <Button variant="outline" size="sm">
            <Eye className="mr-2 h-4 w-4" />
            Make Public
          </Button>

          <Button variant="outline" size="sm">
            <EyeOff className="mr-2 h-4 w-4" />
            Make Private
          </Button>
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X className="mr-2 h-4 w-4" />
        Clear Selection
      </Button>
    </div>
  )
}
