"use server"

import { Suspense } from "react"
import { AiModelsClient } from "@/components/features/ai-models-client"
import { WithRoleCheck } from "@/components/auth/with-role-check"
import { db } from "@/db/db"
import { aiModelsTable } from "@/db/schema"

export default async function ModelsPage() {
  return (
    <WithRoleCheck role="administrator" redirectTo="/">
      <div className="container py-6 space-y-8">
        <Suspense fallback={<div>Loading models...</div>}>
          <ModelsContent />
        </Suspense>
      </div>
    </WithRoleCheck>
  )
}

async function ModelsContent() {
  const models = await db.select().from(aiModelsTable)
  
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">AI Models</h1>
        <p className="text-muted-foreground">
          Manage AI models and their configurations
        </p>
      </div>
      <AiModelsClient initialModels={models} />
    </div>
  )
} 