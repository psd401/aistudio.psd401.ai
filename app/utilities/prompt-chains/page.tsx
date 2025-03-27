"use server"

import { getPromptChainToolsAction } from "@/actions/db/prompt-chains-actions"
import { PromptChainList } from "@/components/features/prompt-chains/prompt-chain-list"
import { auth } from "@clerk/nextjs/server"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { redirect } from "next/navigation"

export default async function PromptChainsPage() {
  // Get the current user
  const { userId } = await auth()
  
  // Redirect to sign in if not logged in
  if (!userId) {
    redirect("/sign-in?redirect_url=/utilities/prompt-chains")
  }
  
  // Get all user's tools
  const result = await getPromptChainToolsAction()
  const allTools = result.isSuccess ? result.data : []
  
  // Filter to only show the current user's tools
  const userTools = allTools.filter(tool => tool.creatorId === userId)
  
  // Split by status
  const draftTools = userTools.filter(tool => tool.status === "draft")
  const pendingTools = userTools.filter(tool => tool.status === "pending_approval")
  const approvedTools = userTools.filter(tool => tool.status === "approved")
  const rejectedTools = userTools.filter(tool => tool.status === "rejected")
  
  // Determine default tab
  let defaultTab = "all"
  if (draftTools.length > 0) defaultTab = "drafts"
  else if (pendingTools.length > 0) defaultTab = "pending"
  else if (approvedTools.length > 0) defaultTab = "approved"

  return (
    <div className="container py-8">
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="all">All My Tools</TabsTrigger>
          {draftTools.length > 0 && (
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
          )}
          {pendingTools.length > 0 && (
            <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          )}
          {approvedTools.length > 0 && (
            <TabsTrigger value="approved">Approved</TabsTrigger>
          )}
          {rejectedTools.length > 0 && (
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="all">
          <PromptChainList tools={userTools} />
        </TabsContent>
        
        <TabsContent value="drafts">
          <PromptChainList tools={draftTools} />
        </TabsContent>
        
        <TabsContent value="pending">
          <PromptChainList tools={pendingTools} />
        </TabsContent>
        
        <TabsContent value="approved">
          <PromptChainList tools={approvedTools} />
        </TabsContent>
        
        <TabsContent value="rejected">
          <PromptChainList tools={rejectedTools} />
        </TabsContent>
      </Tabs>
    </div>
  )
} 