import { requireRole } from "@/lib/auth/role-helpers"
import { RepositoryList } from "@/components/features/repositories/repository-list"

export default async function AdminRepositoriesPage() {
  await requireRole("administrator")

  return (
    <div className="container mx-auto py-6">
      <RepositoryList />
    </div>
  )
}