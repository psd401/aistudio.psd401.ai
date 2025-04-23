"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { auth } from "@clerk/nextjs/server"
import { hasToolAccess } from "@/utils/roles"
import { CreateForm } from "../../create/_components/create-form"
import { CreateLayout } from "../../create/_components/create-layout"

interface Props {
  params: {
    id: string
  }
}

export default async function EditAssistantArchitectPage({ params }: Props) {
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
  
  const toolResult = await getAssistantArchitectAction(id)
  if (!toolResult.isSuccess) {
    notFound()
  }
  
  const tool = toolResult.data
  
  // Check if user can edit this tool
  const isCreator = userId === tool.creatorId
  // Allow editing if user is creator and tool is draft, rejected, or approved
  const canEdit = isCreator && (tool.status === "draft" || tool.status === "rejected" || tool.status === "approved")
  
  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  return (
    <CreateLayout currentStep={1} assistantId={id} title="Edit Assistant">
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
        <CreateForm initialData={tool} />
      </div>
    </CreateLayout>
  )
} 