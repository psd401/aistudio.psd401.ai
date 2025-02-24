"use server"

import { MetaPromptingToolClientWrapper } from "@/components/features/meta-prompting/meta-prompting-tool-client-wrapper"

export default async function MetaPromptingPage() {
  return (
    <div className="container py-6">
      <h1 className="mb-6 text-3xl font-semibold">Meta-Prompting</h1>
      <MetaPromptingToolClientWrapper />
    </div>
  )
} 