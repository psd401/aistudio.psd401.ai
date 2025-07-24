import { redirect } from "next/navigation"
import { Chat } from "./_components/chat"
import { getServerSession } from "@/lib/auth/server-session"
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { ensureRDSString, ensureRDSNumber } from "@/lib/type-helpers"

interface ChatPageProps {
  searchParams: Promise<{ conversation?: string }>
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
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
      conversationTitle = ensureRDSString(conversation[0].title); // Set title from fetched conversation

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
      
      initialMessages = messages.map(msg => ({
        id: ensureRDSNumber(msg.id).toString(), // Convert serial ID to string if needed by Chat component
        content: ensureRDSString(msg.content),
        role: ensureRDSString(msg.role) as "user" | "assistant"
      }));
    } else {
      // Optionally redirect or show an error if the conversation is not accessible
      // For now, it will just proceed with an empty initialMessages array and default title
    }
  } else {
    // No conversation ID provided, starting new chat
  }

  return (
    <Chat
      // Pass conversationId only if it's valid and verified, otherwise undefined for new chat
      conversationId={initialMessages.length > 0 ? conversationId : undefined}
      initialMessages={initialMessages}
    />
  )
} 