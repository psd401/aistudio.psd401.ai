import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server-session"
import { SchedulesClient } from "./_components/schedules-client"

export default async function ScheduleManagementPage() {
  // Get current user session
  const session = await getServerSession()
  if (!session || !session.sub) {
    redirect("/sign-in")
  }

  return <SchedulesClient />
}