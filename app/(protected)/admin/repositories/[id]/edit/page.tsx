import { requireRole } from "@/lib/auth/role-helpers"
import { getRepository } from "@/actions/repositories/repository.actions"
import { notFound } from "next/navigation"
import { RepositoryForm } from "@/components/features/repositories/repository-form"

interface EditRepositoryPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditRepositoryPage({ params }: EditRepositoryPageProps) {
  await requireRole("administrator")

  const { id } = await params
  const repositoryId = parseInt(id)
  if (isNaN(repositoryId)) {
    notFound()
  }

  const result = await getRepository(repositoryId)
  if (!result.isSuccess || !result.data) {
    notFound()
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <RepositoryForm repository={result.data} />
    </div>
  )
}