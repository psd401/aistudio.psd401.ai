"use server"

import { Suspense } from "react"
import { RolesTable } from "./_components/roles-table"
import { getRolesAction } from "@/actions/db/roles-actions"
import { getToolsAction } from "@/actions/db/tools-actions"
import { getRoleToolsAction } from "@/actions/db/role-tools-actions"
import { ToolAssignments } from "./_components/tool-assignments"
import { WithRoleCheck } from "@/components/auth/with-role-check"

export default async function RolesPage() {
  return (
    <WithRoleCheck role="administrator" redirectTo="/">
      <div className="container py-6 space-y-8">
        <Suspense fallback={<div>Loading roles...</div>}>
          <RolesContent />
        </Suspense>
      </div>
    </WithRoleCheck>
  )
}

async function RolesContent() {
  const [rolesResult, toolsResult] = await Promise.all([
    getRolesAction(),
    getToolsAction()
  ])

  if (!rolesResult.isSuccess || !toolsResult.isSuccess) {
    return (
      <div className="text-red-500">
        Error loading data: {rolesResult.message || toolsResult.message}
      </div>
    )
  }

  const { data: roles } = rolesResult
  const { data: tools } = toolsResult

  return (
    <>
      <RolesTable roles={roles} />

      <div className="space-y-8">
        {roles.map(async (role) => {
          const toolsResult = await getRoleToolsAction(role.id)
          const assignedTools = toolsResult.isSuccess ? toolsResult.data : []

          return (
            <ToolAssignments
              key={role.id}
              role={role}
              allTools={tools}
              assignedTools={assignedTools}
            />
          )
        })}
      </div>
    </>
  )
} 