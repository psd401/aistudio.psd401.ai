"use client"

import { MetaPromptingToolClientWrapper } from "@/components/features/meta-prompting/meta-prompting-tool-client-wrapper"

export default function MetaPromptingPage() {
  return (
    <div className="section-container">
      <div className="page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Meta-Prompting</h1>
      </div>

      <MetaPromptingToolClientWrapper initialTechniqueId="assumption-exploration" />
    </div>
  )
} 