import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server-session"
import { RepositoryForm } from "@/components/features/repositories/repository-form"

export default async function NewRepositoryPage() {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <RepositoryForm />
    </div>
  )
}