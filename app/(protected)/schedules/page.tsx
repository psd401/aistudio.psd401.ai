import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/utils/roles"
import { SchedulesClient } from "./_components/schedules-client"

export default async function ScheduleManagementPage() {
  // Get current user session
  const session = await getServerSession()
  if (!session || !session.sub) {
    redirect("/sign-in")
  }

  // Check if user has access to assistant-architect tool
  const hasArchitectAccess = await hasToolAccess("assistant-architect")
  if (!hasArchitectAccess) {
    redirect("/")
  }

  return <SchedulesClient />
}