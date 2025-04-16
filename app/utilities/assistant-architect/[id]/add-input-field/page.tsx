"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@clerk/nextjs/server"
import { AddInputFieldForm } from "./_components/add-input-field-form"
import { hasToolAccess } from "@/utils/roles"

interface Props {
  params: {
    id: string
  }
}

export default async function AddInputFieldPage({ params }: Props) {
  // Properly await params
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;
  
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
  
  // Sort input fields by position for correct ordering
  const sortedInputFields = tool.inputFields?.slice().sort((a, b) => a.position - b.position) || []
  
  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Add Input Field to {tool.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddInputFieldForm 
            toolId={tool.id}
            currentPosition={sortedInputFields.length}
          />
        </CardContent>
      </Card>
    </div>
  )
} 