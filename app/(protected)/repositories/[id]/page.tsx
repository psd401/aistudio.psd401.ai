import { redirect, notFound } from "next/navigation"
import { getServerSession } from "@/lib/auth/server-session"
import { getRepository } from "@/actions/repositories/repository.actions"
import { RepositoryDetail } from "@/components/features/repositories/repository-detail"

interface RepositoryPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function RepositoryPage({ params }: RepositoryPageProps) {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

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