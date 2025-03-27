"use server"

import { notFound } from "next/navigation"
import { getPromptChainToolAction } from "@/actions/db/prompt-chains-actions"
import { PromptChainExecution } from "@/components/features/prompt-chains/prompt-chain-execution"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { auth } from "@clerk/nextjs/server"
import { Badge } from "@/components/ui/badge"
import { SubmitForApprovalButton } from "@/components/features/prompt-chains/submit-for-approval-button"
import { EditToolButton } from "@/components/features/prompt-chains/edit-tool-button"
import { ManageInputFields } from "@/components/features/prompt-chains/manage-input-fields"
import { ManagePrompts } from "@/components/features/prompt-chains/manage-prompts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Props {
  params: {
    id: string
  }
}

export default async function PromptChainPage({ params }: Props) {
  // Ensure params is fully resolved before accessing its properties
  const paramsObj = await Promise.resolve(params)
  const id = paramsObj.id
  
  // Get the current user
  const { userId } = await auth()
  
  console.log("Fetching tool with ID:", id)
  const result = await getPromptChainToolAction(id)
  console.log("Tool fetch result:", result)

  if (!result.isSuccess) {
    notFound()
  }

  const tool = result.data
  const isCreator = userId === tool.creatorId
  const isDraft = tool.status === "draft"
  const showSubmitButton = isCreator && isDraft
  const showEditButton = isCreator && (isDraft || tool.status === "rejected")
  const canEditContent = isCreator && (isDraft || tool.status === "rejected")

  return (
    <div className="container py-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{tool.name}</CardTitle>
            {tool.status && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                Status:
                <Badge 
                  variant={
                    tool.status === "approved" ? "default" :
                    tool.status === "draft" ? "outline" :
                    tool.status === "pending_approval" ? "secondary" :
                    "destructive"
                  }
                >
                  {tool.status}
                </Badge>
              </div>
            )}
          </div>
          {showEditButton && (
            <EditToolButton tool={tool} />
          )}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {tool.description}
          </p>
        </CardContent>
        {showSubmitButton && (
          <CardFooter>
            <SubmitForApprovalButton toolId={tool.id} />
          </CardFooter>
        )}
      </Card>

      <Tabs defaultValue="execution" className="space-y-4">
        <TabsList>
          <TabsTrigger value="execution">Execute Tool</TabsTrigger>
          <TabsTrigger value="input-fields">Input Fields</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="execution" className="space-y-4">
          <PromptChainExecution tool={tool} />
        </TabsContent>
        
        <TabsContent value="input-fields">
          <ManageInputFields tool={tool} canEdit={canEditContent} />
        </TabsContent>
        
        <TabsContent value="prompts">
          <ManagePrompts tool={tool} canEdit={canEditContent} />
        </TabsContent>
      </Tabs>
    </div>
  )
} 