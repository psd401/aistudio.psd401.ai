import { requireRole } from "@/lib/auth/role-helpers"
import { getRepository } from "@/actions/repositories/repository.actions"
import { notFound } from "next/navigation"
import { RepositoryDetail } from "@/components/features/repositories/repository-detail"

interface RepositoryPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function RepositoryPage({ params }: RepositoryPageProps) {
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
    <div className="container mx-auto py-6">
      <RepositoryDetail repository={result.data} />
    </div>
  )
}