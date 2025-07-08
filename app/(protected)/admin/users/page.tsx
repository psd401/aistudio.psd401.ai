import { requireRole } from "@/lib/auth/role-helpers"
import { UsersClient } from "@/components/features/users-client"

export default async function AdminUsersPage() {
  // Check admin permissions
  await requireRole("administrator")

  return <UsersClient />
} 