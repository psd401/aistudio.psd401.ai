"use server"

import { Suspense } from "react"
import { WithRoleCheck } from "@/components/auth/with-role-check"
import { db } from "@/db/db"
import { toolsTable } from "@/db/schema"
import { ToolsSection } from "../components/tools-section"

export default async function ToolsPage() {
  return (
    <WithRoleCheck role="administrator" redirectTo="/">
      <div className="container py-6 space-y-8">
        <Suspense fallback={<div>Loading tools...</div>}>
          <ToolsContent />
        </Suspense>
      </div>
    </WithRoleCheck>
  )
}

async function ToolsContent() {
  const tools = await db.select().from(toolsTable)
  
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tools Configuration</h1>
        <p className="text-muted-foreground">
          Configure and manage system tools
        </p>
      </div>
      <ToolsSection />
    </div>
  )
} 