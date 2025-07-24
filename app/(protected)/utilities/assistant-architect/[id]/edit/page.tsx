import { redirect, notFound } from "next/navigation"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { CreateForm } from "../../create/_components/create-form"
import { CreateLayout } from "../../create/_components/create-layout"
import { getServerSession } from "@/lib/auth/server-session"
import { checkUserRoleByCognitoSub, executeSQL } from "@/lib/db/data-api-adapter"

interface Props {
  params: Promise<{
    id: string
  }>
}

export default async function EditAssistantArchitectPage({ params }: Props) {
  const resolvedParams = await params
  const id = resolvedParams.id
  
  const toolResult = await getAssistantArchitectAction(id)
  if (!toolResult.isSuccess) {
    notFound()
  }
  
  const tool = toolResult.data
  
  // Check authentication
  const session = await getServerSession()
  if (!session || !session.sub) {
    redirect("/sign-in")
  }
  
  const isAdmin = await checkUserRoleByCognitoSub(session.sub, 'administrator')
  
  // Get the user ID for comparison
  // tool.userId is the integer user ID from the database, we need to compare with cognito_sub
  // We'll need to check if the current user owns this tool by their database ID
  const currentUserResult = await executeSQL(`
    SELECT id FROM users WHERE cognito_sub = :cognitoSub
  `, [{ name: 'cognitoSub', value: { stringValue: session.sub } }])
  
  const currentUserId = currentUserResult.length > 0 ? currentUserResult[0].id : null
  const isCreator = currentUserId && currentUserId === tool.userId
  
  // Allow editing if user is admin or creator and tool is draft, pending_approval, rejected, or approved
  const canEdit = isAdmin || (isCreator && (tool.status === "draft" || tool.status === "pending_approval" || tool.status === "rejected" || tool.status === "approved"))
  if (!canEdit) {
    redirect(`/utilities/assistant-architect/${id}`)
  }

  return (
    <CreateLayout currentStep={1} assistantId={id} title="Edit Assistant">
      <div className="space-y-6">
        {tool.status === "approved" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
            <p className="text-sm">
              <strong>Note:</strong> This assistant is currently approved and in use. 
              Any changes you make will require re-approval, and the assistant will be unavailable 
              until approved again.
            </p>
          </div>
        )}
        <CreateForm initialData={tool} />
      </div>
    </CreateLayout>
  )
} 