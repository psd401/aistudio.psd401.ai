"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { hasToolAccess } from "@/utils/roles"
import CreateForm from "./_components/create-form"

export default async function CreateAssistantArchitectPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  
  // Check if user has access to the assistant-architect tool based on role permissions
  const hasAccess = await hasToolAccess(userId, "assistant-architect")
  if (!hasAccess) redirect("/dashboard")
  
  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Assistant Architect</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateForm />
        </CardContent>
      </Card>
    </div>
  )
} 