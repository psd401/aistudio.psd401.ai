"use server"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContextManagerClientWrapper } from "@/components/features/political-wording/context-manager-client-wrapper"
import { PromptManagerClientWrapper } from "@/components/features/political-wording/prompt-manager-client-wrapper"

export default async function PoliticalWordingAdminPage() {
  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Political Wording Configuration</h1>
        <p className="text-muted-foreground">
          Configure prompts, contexts, and models for political wording analysis
        </p>
      </div>

      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="contexts">Contexts</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-4">
          <PromptManagerClientWrapper />
        </TabsContent>

        <TabsContent value="contexts" className="space-y-4">
          <ContextManagerClientWrapper />
        </TabsContent>
      </Tabs>
    </div>
  )
} 