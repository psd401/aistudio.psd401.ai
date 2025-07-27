import { requireRole } from "@/lib/auth/role-helpers"
import { RepositoryForm } from "@/components/features/repositories/repository-form"

export default async function NewRepositoryPage() {
  await requireRole("administrator")

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <RepositoryForm />
    </div>
  )
}