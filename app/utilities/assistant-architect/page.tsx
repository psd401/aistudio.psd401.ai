"use server"

import { redirect } from "next/navigation"
import { AssistantArchitectList } from "@/components/features/assistant-architect/assistant-architect-list"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import { PlusCircle } from "lucide-react"
import { auth } from "@clerk/nextjs/server" 
import { hasToolAccess } from "@/utils/roles"
import { getAssistantArchitectsAction } from "@/actions/db/assistant-architect-actions"

export default async function AssistantArchitectsPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  
  // Check if user has access to the assistant-architect tool
  const hasAccess = await hasToolAccess(userId, "assistant-architect")
  if (!hasAccess) redirect("/dashboard")
  
  // Get all assistants the user has access to
  const result = await getAssistantArchitectsAction()
  if (!result.isSuccess) {
    throw new Error(result.message)
  }
  
  const tools = result.data
  
  // Filter assistants by user and status
  const userTools = tools.filter((tool) => tool.creatorId === userId)
  const draftTools = userTools.filter((tool) => tool.status === "draft")
  const pendingTools = userTools.filter((tool) => tool.status === "pending_approval")
  const approvedTools = userTools.filter((tool) => tool.status === "approved")
  const rejectedTools = userTools.filter((tool) => tool.status === "rejected")

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Assistant Architect</h1>
        <Button asChild>
          <Link href="/utilities/assistant-architect/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Assistant
          </Link>
        </Button>
      </div>

      <Separator className="my-6" />

      <h2 className="text-2xl font-semibold mb-4">My Drafts</h2>
      <AssistantArchitectList tools={draftTools} />

      <Separator className="my-6" />

      <h2 className="text-2xl font-semibold mb-4">Pending Approval</h2>
      <AssistantArchitectList tools={pendingTools} />

      <Separator className="my-6" />

      <h2 className="text-2xl font-semibold mb-4">My Approved Assistants</h2>
      <AssistantArchitectList tools={approvedTools} />

      <Separator className="my-6" />

      <h2 className="text-2xl font-semibold mb-4">Rejected</h2>
      <AssistantArchitectList tools={rejectedTools} />
    </div>
  )
} 