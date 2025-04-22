"use client"

import { AssistantArchitectExecution } from "@/components/features/assistant-architect/assistant-architect-execution"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"

interface PreviewPageClientProps {
  assistantId: string
  tool: AssistantArchitectWithRelations
}

export function PreviewPageClient({
  assistantId,
  tool
}: PreviewPageClientProps) {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 space-y-4">
        <AssistantArchitectExecution tool={tool} />
      </div>
    </div>
  )
} 