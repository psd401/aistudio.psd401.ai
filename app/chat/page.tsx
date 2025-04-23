"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Chat } from "./_components/chat"
import { db } from "@/db/db"
import { messagesTable, conversationsTable } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { hasToolAccess } from "@/utils/roles"

interface ChatPageProps {
  searchParams: Promise<{ conversation?: string }>
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  console.log("[ChatPage] Starting auth check")
  const { userId } = await auth()
  console.log("[ChatPage] Auth check complete, userId:", userId)
  
  if (!userId) {
    console.log("[ChatPage] No userId, redirecting to sign-in")
    redirect("/sign-in")
  }

  // Check if user has access to the chat tool
  console.log("[ChatPage] Checking tool access for userId:", userId)
  const hasAccess = await hasToolAccess(userId, "chat")
  console.log("[ChatPage] Tool access check result:", hasAccess)
  
  if (!hasAccess) {
    console.log("[ChatPage] No tool access, redirecting to dashboard")
    redirect("/dashboard")
  }

  console.log("[ChatPage] Access granted, continuing")
  
  let initialMessages = []
  const resolvedParams = await searchParams
  const conversationIdParam = resolvedParams.conversation
  const conversationId = conversationIdParam ? parseInt(conversationIdParam) : undefined

  let conversationTitle = "New Chat"; // Default title

  if (conversationId) {
    console.log(`[ChatPage] Attempting to load conversation ID: ${conversationId} for user: ${userId}`);
    // Step 1: Verify conversation exists and belongs to the user
    const conversation = await db
      .select({
        id: conversationsTable.id,
        title: conversationsTable.title,
      })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.clerkId, userId) // Ensure user owns the conversation
        )
      )
      .limit(1);

    if (conversation && conversation.length > 0) {
      console.log(`[ChatPage] Found conversation: ${JSON.stringify(conversation[0])}`);
      conversationTitle = conversation[0].title; // Set title from fetched conversation

      // Step 2: Fetch messages for the verified conversation
      const messages = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(messagesTable.createdAt);
      
      console.log(`[ChatPage] Fetched ${messages.length} messages for conversation ${conversationId}`);

      initialMessages = messages.map(msg => ({
        id: msg.id.toString(), // Convert serial ID to string if needed by Chat component
        content: msg.content,
        role: msg.role as "user" | "assistant"
      }));
    } else {
      console.log(`[ChatPage] Conversation ID: ${conversationId} not found or not owned by user: ${userId}`);
      // Optionally redirect or show an error if the conversation is not accessible
      // For now, it will just proceed with an empty initialMessages array and default title
    }
  } else {
    console.log("[ChatPage] No conversation ID provided, starting new chat.");
  }

  return (
    <Chat
      // Pass conversationId only if it's valid and verified, otherwise undefined for new chat
      conversationId={initialMessages.length > 0 ? conversationId : undefined}
      title={conversationTitle} // Pass the fetched or default title
      initialMessages={initialMessages}
    />
  )
} 