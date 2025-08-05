import { requireRole } from "@/lib/auth/role-helpers"
import { RepositoriesAdminClient } from "./_components/repositories-admin-client"

export default async function AdminRepositoriesPage() {
  // Check admin permissions
  await requireRole("administrator")

  return <RepositoriesAdminClient />
}