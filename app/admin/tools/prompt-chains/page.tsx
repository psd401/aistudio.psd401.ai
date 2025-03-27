"use server"

import { getPendingPromptChainToolsAction } from "@/actions/db/prompt-chains-actions"
import { PromptChainApproval } from "@/components/features/prompt-chains/prompt-chain-approval"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminPromptChainsPage() {
  const result = await getPendingPromptChainToolsAction()
  const pendingTools = result.isSuccess ? result.data : []

  if (pendingTools.length === 0) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>No Pending Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              There are no prompt chain tools waiting for approval.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Pending Prompt Chain Tools</h1>
        <div className="space-y-8">
          {pendingTools.map((tool) => (
            <PromptChainApproval
              key={tool.id}
              request={tool}
            />
          ))}
        </div>
      </div>
    </div>
  )
} 