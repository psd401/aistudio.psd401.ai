"use server"

import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { hasToolAccess } from "@/utils/roles"
import { CreateForm } from "./_components/create-form"
import { CreateLayout } from "./_components/create-layout"

export default async function CreateAssistantPage() {
  const { userId } = await auth()
  
  if (!userId) {
    redirect("/sign-in")
  }
  
  // Check if user has access to the assistant-architect tool
  const hasAccess = await hasToolAccess(userId, "assistant-architect")
  if (!hasAccess) {
    redirect("/dashboard")
  }

  return (
    <CreateLayout currentStep={1} title="Create Assistant">
      <CreateForm />
    </CreateLayout>
  )
} 