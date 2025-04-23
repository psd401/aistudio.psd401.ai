"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { getAiModelsAction } from "@/actions/db/ai-models-actions"
import { hasToolAccess } from "@/utils/roles"
import { CreateLayout } from "../../../create/_components/create-layout"
import { PromptsPageClient } from "./_components/prompts-page-client"

export default async function PromptsPage({
  params
}: {
  params: { id: string }
}) {
  // Properly await params
  const resolvedParams = await Promise.resolve(params)
  const id = resolvedParams.id

  const { userId } = await auth()
  if (!userId) {
    redirect("/sign-in")
  }

  // Check if user has access to the assistant-architect tool
  const hasAccess = await hasToolAccess(userId, "assistant-architect")
  if (!hasAccess) {
    redirect("/dashboard")
  }

  const result = await getAssistantArchitectAction(id)
  if (!result.isSuccess) {
    notFound()
  }

  const tool = result.data

  // Check if user can edit this tool
  const isCreator = userId === tool.creatorId
  const canEdit = isCreator && (tool.status === "draft" || tool.status === "rejected" || tool.status === "approved")

  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  // Get models for the form
  const modelsResult = await getAiModelsAction()
  const models = modelsResult.isSuccess ? modelsResult.data : []

  // Sort prompts by position
  const sortedPrompts = tool.prompts?.slice().sort((a, b) => a.position - b.position) || []

  // Sort input fields by position
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
    </CreateLayout>
  )
} 