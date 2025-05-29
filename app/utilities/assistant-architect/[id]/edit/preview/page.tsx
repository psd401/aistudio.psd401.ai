"use server"

import { getAssistantArchitectByIdAction } from "@/actions/db/assistant-architect-actions"
import { PreviewPageClient } from "./_components/preview-page-client"
import { CreateLayout } from "@/app/utilities/assistant-architect/create/_components/create-layout"
import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { hasRole } from "@/utils/roles"

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

  const result = await getAssistantArchitectByIdAction(id)
  if (!result.isSuccess || !result.data) {
    notFound()
  }

  const tool = result.data

  const isAdmin = await hasRole(userId, "administrator")
  const isCreator = userId === tool.creatorId
  const canEdit = isAdmin || (isCreator && (tool.status === "draft" || tool.status === "pending_approval" || tool.status === "rejected" || tool.status === "approved"))

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

      <div className="flex justify-end mt-8">
        <a href={`/utilities/assistant-architect/${id}/edit/submit`}>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
          >
            Continue
          </button>
        </a>
      </div>
    </CreateLayout>
  )
} 