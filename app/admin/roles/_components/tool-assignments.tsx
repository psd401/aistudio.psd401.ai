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
import { assignToolToRoleAction, removeToolFromRoleAction } from "@/actions/db/role-tools-actions"
import { toast } from "sonner"

interface ToolAssignmentsProps {
  role: SelectRole
  allTools: SelectTool[]
  assignedTools: SelectTool[]
}

export function ToolAssignments({
  role,
  allTools,
  assignedTools
}: ToolAssignmentsProps) {
  const handleToggleAssignment = async (tool: SelectTool) => {
    const isAssigned = assignedTools.some((t) => t.id === tool.id)
    
    try {
      const result = isAssigned
        ? await removeToolFromRoleAction(role.id, tool.id)
        : await assignToolToRoleAction(role.id, tool.id)

      if (result.isSuccess) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">
          Tool Assignments for {role.name}
        </h3>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allTools.map((tool) => {
            const isAssigned = assignedTools.some((t) => t.id === tool.id)
            return (
              <TableRow key={tool.id}>
                <TableCell>{tool.name}</TableCell>
                <TableCell>{tool.description}</TableCell>
                <TableCell>
                  {tool.isActive ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-red-600">Inactive</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant={isAssigned ? "destructive" : "default"}
                    size="sm"
                    onClick={() => handleToggleAssignment(tool)}
                  >
                    {isAssigned ? "Remove" : "Assign"}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
} 