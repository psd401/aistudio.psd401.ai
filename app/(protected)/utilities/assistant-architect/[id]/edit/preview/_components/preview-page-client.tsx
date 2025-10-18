"use client"

import { AssistantArchitectStreaming } from "@/components/features/assistant-architect/assistant-architect-streaming"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"

interface PreviewPageClientProps {
  assistantId: string
  tool: AssistantArchitectWithRelations
}

export function PreviewPageClient({
  tool
}: PreviewPageClientProps) {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 space-y-4">
        <AssistantArchitectStreaming tool={tool} isPreview={true} />
      </div>
    </div>
  )
} 