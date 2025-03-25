"use client"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { SelectRole, SelectTool } from "@/db/schema"
import { useState } from "react"
import { RoleForm } from "./role-form"
import { ToolAssignments } from "./tool-assignments"
import { deleteRoleAction } from "@/actions/db/roles-actions"
import { getToolsForRoleAction } from "@/actions/db/role-tools-actions"
import { toast } from "sonner"

interface RolesTableProps {
  roles: SelectRole[]
  tools: SelectTool[]
}

export function RolesTable({ roles, tools }: RolesTableProps) {
  const [editingRole, setEditingRole] = useState<SelectRole | null>(null)
  const [selectedRole, setSelectedRole] = useState<SelectRole | null>(null)
  const [assignedTools, setAssignedTools] = useState<SelectTool[]>([])

  const handleDelete = async (role: SelectRole) => {
    if (role.isSystem) {
      toast.error("Cannot delete system roles")
      return
    }

    if (!confirm("Are you sure you want to delete this role?")) return

    const result = await deleteRoleAction(role.id)
    if (result.isSuccess) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const handleManageTools = async (role: SelectRole) => {
    const result = await getToolsForRoleAction(role.id)
    if (result.isSuccess) {
      setAssignedTools(result.data)
      setSelectedRole(role)
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
        <Button onClick={() => setEditingRole({ id: 0 } as SelectRole)}>
          Add Role
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>System Role</TableHead>
            <TableHead className="w-[150px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>{role.name}</TableCell>
              <TableCell>{role.description}</TableCell>
              <TableCell>{role.isSystem ? "Yes" : "No"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingRole(role)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleManageTools(role)}
                  >
                    Tools
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={role.isSystem}
                    onClick={() => handleDelete(role)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <RoleForm
        role={editingRole}
        onClose={() => setEditingRole(null)}
      />

      {selectedRole && (
        <ToolAssignments
          role={selectedRole}
          allTools={tools}
          assignedTools={assignedTools}
        />
      )}
    </div>
  )
} 