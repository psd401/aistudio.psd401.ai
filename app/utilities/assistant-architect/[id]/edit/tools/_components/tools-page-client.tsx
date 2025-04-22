"use client"

import type { SelectTool } from "@/types"

interface ToolsPageClientProps {
  assistantId: string
  tools: SelectTool[]
}

export function ToolsPageClient({ assistantId, tools }: ToolsPageClientProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tools</h2>
            <p className="text-sm text-muted-foreground">
              Configure the tools that will be available to your Assistant Architect.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 