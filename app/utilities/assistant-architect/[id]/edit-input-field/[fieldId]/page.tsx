"use server"

import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@clerk/nextjs/server"
import { EditInputFieldForm } from "./_components/edit-input-field-form"
import { hasToolAccess } from "@/utils/roles"
import { db } from "@/db/db"
import { toolInputFieldsTable } from "@/db/schema"
import { eq } from "drizzle-orm"

interface Props {
  params: {
    id: string
    fieldId: string
  }
}

export default async function EditInputFieldPage({ params }: Props) {
  // Properly await params
  const resolvedParams = await Promise.resolve(params);
  const { id, fieldId } = resolvedParams;
  
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
  
  // Get the specific input field to edit
  const [field] = await db
    .select()
    .from(toolInputFieldsTable)
    .where(eq(toolInputFieldsTable.id, fieldId));
  
  if (!field) {
    notFound()
  }
  
  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Edit Input Field for {tool.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditInputFieldForm 
            toolId={id}
            field={field}
          />
        </CardContent>
      </Card>
    </div>
  )
} 