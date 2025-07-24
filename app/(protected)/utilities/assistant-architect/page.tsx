import { redirect } from "next/navigation"
import { AssistantArchitectList } from "@/components/features/assistant-architect/assistant-architect-list"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import { PlusCircle } from "lucide-react"
import { getAssistantArchitectsAction } from "@/actions/db/assistant-architect-actions"
import { getServerSession } from "@/lib/auth/server-session"

export default async function AssistantArchitectsPage() {
  // Get current user session
  const session = await getServerSession()
  if (!session || !session.sub) {
    redirect("/sign-in")
  }
  
  const cognitoSub = session.sub
  
  // Get current user's database ID
  const { getCurrentUserAction } = await import("@/actions/db/get-current-user-action")
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess || !currentUser.data) {
    throw new Error("User not found")
  }
  const userId = currentUser.data.user.id
  
  // Get all assistants the user has access to
  const result = await getAssistantArchitectsAction()
  if (!result.isSuccess) {
    throw new Error(result.message)
  }
  
  const tools = result.data
  
  // Filter assistants by user and status using user_id
  const userTools = tools.filter((tool) => tool.userId === userId)
  const draftTools = userTools.filter((tool) => tool.status === "draft")
  const pendingTools = userTools.filter((tool) => tool.status === "pending_approval")
  const approvedTools = userTools.filter((tool) => tool.status === "approved")
  const rejectedTools = userTools.filter((tool) => tool.status === "rejected")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Assistant Architect</h1>
        <Button asChild>
          <Link href="/utilities/assistant-architect/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Assistant
          </Link>
        </Button>
      </div>

      <Separator />

      <div>
      <h2 className="text-xl font-semibold mb-4">My Drafts</h2>
      <AssistantArchitectList tools={draftTools} />
      </div>

      <Separator />

      <div>
      <h2 className="text-xl font-semibold mb-4">Pending Approval</h2>
      <AssistantArchitectList tools={pendingTools} />
      </div>

      <Separator />

      <div>
      <h2 className="text-xl font-semibold mb-4">My Approved Assistants</h2>
      <AssistantArchitectList tools={approvedTools} />
      </div>

      <Separator />

      <div>
      <h2 className="text-xl font-semibold mb-4">Rejected</h2>
      <AssistantArchitectList tools={rejectedTools} />
      </div>
    </div>
  )
} 