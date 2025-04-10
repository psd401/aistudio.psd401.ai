"use server"

import { notFound } from "next/navigation"
import { getPromptChainToolAction } from "@/actions/db/prompt-chains-actions"
import { PromptChainExecution } from "@/components/features/prompt-chains/prompt-chain-execution"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Public route for executing approved prompt chain tools.
 * This is the route that users will access through the navigation menu.
 * 
 * The route will:
 * 1. Only show approved tools (404 for non-approved tools)
 * 2. Show a simplified interface focused on execution
 * 3. Remove administrative functions
 * 
 * URL Pattern: /tools/prompt-chains/{id}
 * where {id} is the UUID of the prompt chain tool
 */

interface Props {
  params: {
    id: string
  }
}

export default async function PromptChainToolPage(props: Props) {
  const { id } = await props.params
  const result = await getPromptChainToolAction(id)
  
  if (!result.isSuccess || result.data.status !== "approved") {
    notFound()
  }

  const tool = result.data

  return (
    <div className="container py-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{tool.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {tool.description}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execute Tool</CardTitle>
        </CardHeader>
        <CardContent>
          <PromptChainExecution tool={tool} />
        </CardContent>
      </Card>
    </div>
  )
} 