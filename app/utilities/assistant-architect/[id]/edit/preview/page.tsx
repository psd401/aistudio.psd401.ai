"use server"

import { getAssistantArchitectByIdAction } from "@/actions/db/assistant-architect-actions"
import { PreviewPageClient } from "./_components/preview-page-client"
import { CreateLayout } from "../../../create/_components/create-layout"

interface PreviewPageProps {
  params: {
    id: string
  }
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  // Extract id first to avoid the params.id error
  const id = params.id
  const result = await getAssistantArchitectByIdAction(id)

  if (!result.isSuccess || !result.data) {
    throw new Error("Failed to load Assistant Architect")
  }

  return (
    <CreateLayout currentStep={4} assistantId={id} title="Preview & Test">
      <div className="space-y-6">
        <p className="text-muted-foreground">
          Test your assistant with the configured input fields and prompts.
        </p>

        <PreviewPageClient
          assistantId={id}
          tool={result.data}
        />
      </div>
    </CreateLayout>
  )
} 