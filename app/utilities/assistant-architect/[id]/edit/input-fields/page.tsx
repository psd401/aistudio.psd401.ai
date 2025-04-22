"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { hasToolAccess } from "@/utils/roles"
import { CreateLayout } from "../../../create/_components/create-layout"
import { InputFieldsPageClient } from "./_components/input-fields-page-client"

export default async function InputFieldsPage({
  params: { id }
}: {
  params: { id: string }
}) {
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
  const canEdit = isCreator && (tool.status === "draft" || tool.status === "rejected")

  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  // Sort input fields by position
  const sortedInputFields = tool.inputFields?.slice().sort((a, b) => a.position - b.position) || []

  return (
    <CreateLayout currentStep={2} assistantId={id} title="Add Input Fields">
      <div className="space-y-6">
        <p className="text-muted-foreground">
          Add and manage input fields that your assistant architect tool will use.
        </p>

        <InputFieldsPageClient assistantId={id} inputFields={sortedInputFields} />
      </div>
    </CreateLayout>
  )
}