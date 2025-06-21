"use server"

import { redirect } from "next/navigation"
import { ConversationsList } from "./_components/conversations-list"
import { hasToolAccess } from "@/utils/roles"

export default async function ChatLayout({
  children
}: {
  children: React.ReactNode
}) {
  // Remove Clerk imports and logic. If you need to check if a user is signed in or get user info, use getCurrentUser from aws-amplify/auth in a useEffect and state.

  // Check if user has access to the chat tool
  const hasAccess = await hasToolAccess(userId, "chat")
  if (!hasAccess) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen pt-14">
      <div className="flex flex-1 min-h-0 overflow-hidden bg-background/50 p-1.5 border border-border rounded-xl shadow-md">
        {/* Sidebar */}
        <div className="w-80 border-r border-border bg-card/30 overflow-hidden flex flex-col flex-shrink-0 rounded-l-lg">
          <div className="p-4 overflow-auto flex-1 min-h-0">
            <ConversationsList />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-r-lg">
          {/* Add Page Title */}
          <h1 className="text-2xl font-semibold mb-4 text-foreground px-4 pt-4">
            AI Model Explorer
          </h1>
          {/* Render the page content (ChatPage) */}
          <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
} 