import { redirect } from "next/navigation"
import { ConversationsList } from "./_components/conversations-list"
import { hasToolAccess } from "@/utils/roles"
import { getServerSession } from "@/lib/auth/server-session"
import { NavbarNested } from "@/components/navigation/navbar-nested"

export default async function ChatLayout({
  children
}: {
  children: React.ReactNode
}) {
  // Get current session
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

  // Check if user has access to the chat tool
  const hasAccess = await hasToolAccess("chat")
  if (!hasAccess) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen pt-14">
      <NavbarNested />
      <main className="flex-1 lg:pl-[68px]">
        <div className="bg-white p-4 sm:p-6 md:p-8">
          <div className="flex gap-6">
            {/* Sidebar */}
            <div className="w-80 bg-white border border-gray-200 overflow-hidden flex flex-col flex-shrink-0 rounded-lg">
              <ConversationsList />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
              {/* Add Page Title */}
              <h1 className="text-2xl font-semibold mb-4 text-gray-900">
                Chat with AI
              </h1>
              {/* Render the page content (ChatPage) */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {children}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
} 