"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { hasToolAccess } from "@/utils/roles"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { CreateLayout } from "../../../create/_components/create-layout"
import { SubmitForm } from "./_components/submit-form"

interface Props {
  params: {
    id: string
  }
}

export default async function SubmitAssistantArchitectPage({ params }: Props) {
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
  const canEdit = isCreator && (tool.status === "draft" || tool.status === "rejected")
  
  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  return (
    <CreateLayout currentStep={5} assistantId={id} title="Submit your assistant for Approval">
      <SubmitForm id={id} tool={tool} />
    </CreateLayout>
  )
} 