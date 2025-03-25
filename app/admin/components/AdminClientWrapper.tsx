'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiModelsClient } from "@/components/features/ai-models-client"
import { UsersClient } from "@/components/features/users-client"
import { ToolsSection } from "./tools-section"
import type { SelectUser, SelectAiModel, SelectRole, SelectTool } from "@/types"
import { RolesTable } from "../roles/_components/roles-table"

interface AdminClientWrapperProps {
  currentUser: SelectUser
  users: SelectUser[]
  models: SelectAiModel[]
  roles: SelectRole[]
  tools: SelectTool[]
}

export function AdminClientWrapper({ currentUser, users, models, roles, tools }: AdminClientWrapperProps) {
  return (
    <div className="container py-8">
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-8">
          <UsersClient currentUser={currentUser} initialUsers={users} />
        </TabsContent>

        <TabsContent value="models" className="mt-8">
          <AiModelsClient initialModels={models} />
        </TabsContent>

        <TabsContent value="tools" className="mt-8">
          <ToolsSection />
        </TabsContent>

        <TabsContent value="roles" className="mt-8">
          <RolesTable roles={roles} tools={tools} />
        </TabsContent>
      </Tabs>
    </div>
  )
} 