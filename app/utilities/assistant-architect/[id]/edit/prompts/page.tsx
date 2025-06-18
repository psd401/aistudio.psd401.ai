"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { getAiModelsAction } from "@/actions/db/ai-models-actions"
import { hasRole } from "@/utils/roles"
import { CreateLayout } from "@/app/utilities/assistant-architect/create/_components/create-layout"
import { PromptsPageClient } from "./_components/prompts-page-client"
import Link from "next/link"

export default async function PromptsPage({ params }: { params: { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  const id = resolvedParams.id
  const result = await getAssistantArchitectAction(id)
  if (!result.isSuccess) {
    notFound()
  }
  const tool = result.data
  const isAdmin = await hasRole(userId, "administrator")
  const isCreator = userId === tool.creatorId
  const canEdit = isAdmin || (isCreator && (tool.status === "draft" || tool.status === "pending_approval" || tool.status === "rejected" || tool.status === "approved"))
  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }
  const modelsResult = await getAiModelsAction()
  const models = modelsResult.isSuccess ? modelsResult.data : []
  const sortedPrompts = tool.prompts?.slice().sort((a, b) => a.position - b.position) || []
  const sortedInputFields = tool.inputFields?.slice().sort((a, b) => a.position - b.position) || []
  return (
    <CreateLayout currentStep={3} assistantId={id} title="Add Prompts">
      <div className="space-y-6">
        {tool.status === "approved" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
            <p className="text-sm">
              <strong>Note:</strong> This assistant is currently approved and in use. 
              Any changes you make will require re-approval, and the assistant will be unavailable 
              until approved again.
            </p>
          </div>
        )}
        <p className="text-muted-foreground">
          Add and manage prompts that define how your assistant processes inputs and generates responses.
        </p>
        <PromptsPageClient 
          assistantId={id} 
          prompts={sortedPrompts} 
          models={models}
          inputFields={sortedInputFields}
        />
      </div>
      <div className="flex justify-end mt-8">
        <Link href={`/utilities/assistant-architect/${id}/edit/preview`}>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
          >
            Continue
          </button>
        </Link>
      </div>
    </CreateLayout>
  )
} 