"use server"

import { getPendingAssistantArchitectsAction } from "@/actions/db/assistant-architect-actions"
import { AssistantArchitectApproval } from "@/components/features/assistant-architect/assistant-architect-approval"
import { WithRoleCheck } from "@/components/auth/with-role-check"
import { Suspense } from "react"

export default async function AdminAssistantArchitectsPage() {
  return (
    <WithRoleCheck role="administrator" redirectTo="/">
      <div className="container py-6 space-y-8">
        <Suspense fallback={<div>Loading pending approvals...</div>}>
          <AssistantArchitectContent />
        </Suspense>
      </div>
    </WithRoleCheck>
  )
}

async function AssistantArchitectContent() {
  const result = await getPendingAssistantArchitectsAction()

  if (!result.isSuccess) {
    return <div>Error fetching pending approvals: {result.message}</div>
  }

  const pendingRequests = result.data

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Pending Assistant Architect Approvals</h1>

      {pendingRequests.length === 0 ? (
        <p className="text-muted-foreground">
          There are no Assistant Architects waiting for approval.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingRequests.map((request) => (
            <AssistantArchitectApproval
              key={request.id}
              request={request}
              onProcessed={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
} 