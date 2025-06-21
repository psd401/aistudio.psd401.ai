"use server"

import { Suspense } from "react"
import { RolesTable } from "./_components/roles-table"
import { RoleForm } from "./_components/role-form"
import { requireRole } from "@/lib/auth/role-helpers"
import { getRoles, getTools } from "@/lib/db/data-api-adapter"

export default async function RolesPage() {
  await requireRole("administrator");
  
  // Fetch roles and tools from the database
  const [roles, tools] = await Promise.all([
    getRoles(),
    getTools()
  ]);
  
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Role Management</h1>
      <Suspense fallback={<div>Loading roles...</div>}>
        <RolesTable roles={roles || []} tools={tools || []} />
      </Suspense>
    </div>
  )
} 