"use server"

import { redirect } from "next/navigation"
import { Chat } from "./_components/chat"
import { hasToolAccess } from "@/utils/roles"
import { getServerSession } from "@/lib/auth/server-session"
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/db/data-api-adapter"

interface ChatPageProps {
  searchParams: Promise<{ conversation?: string }>
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  console.log("[ChatPage] Starting auth check")
  
  // Get current session and user
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }
  
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    redirect("/sign-in")
  }
  
  const userId = currentUser.data.user.id
  
  let initialMessages = []
  const resolvedParams = await searchParams
  const conversationIdParam = resolvedParams.conversation
  const conversationId = conversationIdParam ? parseInt(conversationIdParam) : undefined

  let conversationTitle = "New Chat"; // Default title

  if (conversationId) {
    console.log(`[ChatPage] Attempting to load conversation ID: ${conversationId}`);
    // Step 1: Verify conversation exists and belongs to the user
    const conversationQuery = `
      SELECT id, title
      FROM conversations
      WHERE id = :conversationId
        AND user_id = :userId
      LIMIT 1
    `;
    const conversationParams = [
      { name: 'conversationId', value: { longValue: conversationId } },
      { name: 'userId', value: { longValue: userId } }
    ];
    const conversation = await executeSQL(conversationQuery, conversationParams);

    if (conversation && conversation.length > 0) {
      console.log(`[ChatPage] Found conversation: ${JSON.stringify(conversation[0])}`);
      conversationTitle = conversation[0].title; // Set title from fetched conversation

      // Step 2: Fetch messages for the verified conversation
      const messagesQuery = `
        SELECT id, content, role
        FROM messages
        WHERE conversation_id = :conversationId
        ORDER BY created_at ASC
      `;
      const messagesParams = [
        { name: 'conversationId', value: { longValue: conversationId } }
      ];
      const messages = await executeSQL(messagesQuery, messagesParams);
      
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