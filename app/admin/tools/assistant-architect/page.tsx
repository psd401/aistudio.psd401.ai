"use server"

import { getPendingAssistantArchitectsAction, getApprovedAssistantArchitectsForAdminAction } from "@/actions/db/assistant-architect-actions"
import { AssistantArchitectApproval } from "@/components/features/assistant-architect/assistant-architect-approval"
import { WithRoleCheck } from "@/components/auth/with-role-check"
import { Suspense } from "react"
import { Separator } from "@/components/ui/separator"
import { SelectAssistantArchitect } from "@/db/schema"

// Define the type for assistant with relations
type AssistantWithRelations = SelectAssistantArchitect & {
  inputFields: any[]
  prompts: any[]
}

export default async function AdminAssistantArchitectsPage() {
  return (
    <WithRoleCheck role="administrator" redirectTo="/">
      <div className="container py-6 space-y-8">
        <h1 className="text-2xl font-bold">Assistant Architect Management</h1>
        
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">Pending Approval</h2>
            <Suspense fallback={<div>Loading pending approvals...</div>}>
              <PendingAssistantsContent />
            </Suspense>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-4">Approved Assistants</h2>
            <Suspense fallback={<div>Loading approved assistants...</div>}>
              <ApprovedAssistantsContent />
            </Suspense>
          </section>
        </div>
      </div>
    </WithRoleCheck>
  )
}

async function PendingAssistantsContent() {
  const result = await getPendingAssistantArchitectsAction()

  if (!result.isSuccess) {
    return <div>Error fetching pending approvals: {result.message}</div>
  }

  const pendingRequests = result.data as AssistantWithRelations[]

  return (
    <div>
      {pendingRequests.length === 0 ? (
        <p className="text-muted-foreground">
          There are no assistants waiting for approval.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingRequests.map((request) => (
            <AssistantArchitectApproval
              key={request.id}
              request={request}
            />
          ))}
        </div>
      )}
    </div>
  )
}

async function ApprovedAssistantsContent() {
  const result = await getApprovedAssistantArchitectsForAdminAction()

  if (!result.isSuccess) {
    return <div>Error fetching approved assistants: {result.message}</div>
  }

  const approvedAssistants = result.data as AssistantWithRelations[]

  return (
    <div>
      {approvedAssistants.length === 0 ? (
        <p className="text-muted-foreground">
          There are no approved assistants.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {approvedAssistants.map((assistant) => (
            <AssistantArchitectApproval
              key={assistant.id}
              request={assistant}
              isApproved
            />
          ))}
        </div>
      )}
    </div>
  )
} 