"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { getAiModelsAction } from "@/actions/db/ai-models-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@clerk/nextjs/server"
import { AddPromptForm } from "./_components/add-prompt-form"
import { hasToolAccess } from "@/utils/roles"

interface Props {
  params: {
    id: string
  }
}

export default async function AddPromptPage({ params }: Props) {
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
  
  // Get models for the form
  const modelsResult = await getAiModelsAction()
  const models = modelsResult.isSuccess ? modelsResult.data : []
  
  // Sort prompts by position
  const sortedPrompts = tool.prompts?.slice().sort((a, b) => a.position - b.position) || []
  
  // Sort input fields by position
  const sortedInputFields = tool.inputFields?.slice().sort((a, b) => a.position - b.position) || []
  
  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Add Prompt to {tool.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddPromptForm 
            toolId={tool.id}
            models={models}
            isParallel={tool.isParallel}
            previousPrompts={sortedPrompts}
            inputFields={sortedInputFields}
            currentPosition={sortedPrompts.length}
          />
        </CardContent>
      </Card>
    </div>
  )
} 