"use server"

import { getAssistantArchitectByIdAction } from "@/actions/db/assistant-architect-actions"
import { PreviewPageClient } from "./_components/preview-page-client"
import { CreateLayout } from "../../../create/_components/create-layout"
import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { hasToolAccess } from "@/utils/roles"

interface PreviewPageProps {
  params: { id: string }
}

export default async function PreviewPage({ params }: PreviewPageProps) {
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

  const result = await getAssistantArchitectByIdAction(id)
  if (!result.isSuccess || !result.data) {
    notFound()
  }

  const tool = result.data

  // Check if user can edit this tool
  const isCreator = userId === tool.creatorId
  const canEdit = isCreator && (tool.status === "draft" || tool.status === "rejected" || tool.status === "approved")

  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  return (
    <CreateLayout currentStep={4} assistantId={id} title="Preview & Test">
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
          Test your assistant with the configured input fields and prompts.
        </p>

        <PreviewPageClient
          assistantId={id}
          tool={tool}
        />
      </div>
    </CreateLayout>
  )
} 