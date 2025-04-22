"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@clerk/nextjs/server"
import EditForm from "./_components/edit-form"
import { hasToolAccess } from "@/utils/roles"

interface Props {
  params: {
    id: string
  }
}

export default async function EditAssistantArchitectPage({ params }: Props) {
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
  
  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Edit Assistant Architect: {tool.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditForm 
            id={tool.id}
            initialData={{
              name: tool.name,
              description: tool.description
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
} 