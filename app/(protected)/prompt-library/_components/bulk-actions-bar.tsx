"use client"

import { Button } from "@/components/ui/button"
import { Trash2, X, Eye, EyeOff } from "lucide-react"
import { usePromptLibraryStore } from "@/lib/stores/prompt-library-store"
import { deletePrompt } from "@/actions/prompt-library.actions"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

interface BulkActionsBarProps {
  selectedCount: number
  onClearSelection: () => void
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection
}: BulkActionsBarProps) {
  const queryClient = useQueryClient()
  const { selectedPrompts } = usePromptLibraryStore()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const promises = Array.from(selectedPrompts).map((id) => deletePrompt(id))
      await Promise.all(promises)
    },
    onSuccess: () => {
      toast.success(`${selectedCount} prompt(s) deleted successfully`)
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      onClearSelection()
    },
    onError: () => {
      toast.error("Failed to delete prompts")
    }
  })

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} prompt(s)?`)) {
      deleteMutation.mutate()
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
            disabled={deleteMutation.isPending}
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
