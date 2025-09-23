import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server-session"
import { ExecutionResultClient } from "./_components/execution-result-client"

export default async function ExecutionResultDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  // Get current user session
  const session = await getServerSession()
  if (!session || !session.sub) {
    redirect("/sign-in")
  }

  const { id } = await params

  return <ExecutionResultClient resultId={id} />
}