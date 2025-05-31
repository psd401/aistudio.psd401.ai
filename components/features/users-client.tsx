"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { SelectUser } from "@/types"
import { UserRoleSelect } from "@/components/user/user-role-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface UsersClientProps {
  currentUser: SelectUser
  initialUsers: SelectUser[]
}

export function UsersClient({ currentUser, initialUsers }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers)
  const [isUpdating, setIsUpdating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<SelectUser | null>(null)

  const handleRoleChange = async (userId: number, newRole: string) => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })

      // Handle non-JSON responses
      const text = await response.text()
      let result
      try {
        result = text ? JSON.parse(text) : {}
      } catch (parseError) {
        console.error("Failed to parse JSON response", text)
        throw new Error("Invalid server response")
      }
      
      if (!response.ok || (result && !result.success)) {
        throw new Error((result && result.message) || "Failed to update role")
      }

      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ))

      toast.success("User role updated successfully")
    } catch (error) {
      console.error("Error updating user role", error)
      toast.error(error instanceof Error ? error.message : "Failed to update user role")
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = (user: SelectUser) => {
    setUserToDelete(user)
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!userToDelete) return

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      })
      
      // Handle non-JSON responses
      const text = await response.text()
      let result
      try {
        result = text ? JSON.parse(text) : {}
      } catch (parseError) {
        console.error("Failed to parse JSON response", text)
        throw new Error("Invalid server response")
      }
      
      if (!response.ok || (result && !result.success)) {
        throw new Error((result && result.message) || "Failed to delete user")
      }

      setUsers(users.filter(user => user.id !== userToDelete.id))
      toast.success("User deleted successfully")
    } catch (error) {
      console.error("Error deleting user", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete user")
    } finally {
      setShowDeleteDialog(false)
      setUserToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(user => (
            <TableRow key={user.id}>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      {user.firstName} {user.lastName || '(No name set)'}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clerk ID: {user.clerkId}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell>
                <UserRoleSelect
                  currentRole={user.role}
                  onRoleChange={(newRole) => handleRoleChange(user.id, newRole)}
                  disabled={user.clerkId === currentUser.clerkId || isUpdating}
                />
              </TableCell>
              <TableCell>
                {new Date(user.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(user)}
                  disabled={user.clerkId === currentUser.clerkId}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}