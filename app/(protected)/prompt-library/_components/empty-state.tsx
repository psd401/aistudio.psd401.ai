"use client"

import { Button } from "@/components/ui/button"
import { Plus, FileText } from "lucide-react"
import { useRouter } from "next/navigation"

export function EmptyState() {
  const router = useRouter()

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <div className="rounded-full bg-muted p-6">
        <FileText className="h-12 w-12 text-muted-foreground" />
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold">No prompts found</h3>
        <p className="text-sm text-muted-foreground">
          Get started by creating your first prompt
        </p>
      </div>

      <Button onClick={() => router.push('/prompt-library/new')}>
        <Plus className="mr-2 h-4 w-4" />
        Create Prompt
      </Button>
    </div>
  )
}
