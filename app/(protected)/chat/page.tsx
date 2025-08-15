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
  
  let initialMessages: Array<{ id: string; content: string; role: "user" | "assistant" }> = []
  const resolvedParams = await searchParams
  const conversationIdParam = resolvedParams.conversation
  const conversationId = conversationIdParam ? parseInt(conversationIdParam) : undefined


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
      // Conversation verified

      // Step 2: Fetch messages for the verified conversation with model info
      const messagesQuery = `
        SELECT m.id, m.content, m.role, m.model_id, m.reasoning_content, m.token_usage,
               am.name as model_name, am.provider as model_provider, 
               am.model_id as model_identifier
        FROM messages m
        LEFT JOIN ai_models am ON m.model_id = am.id
        WHERE m.conversation_id = :conversationId
        ORDER BY m.created_at ASC
      `;
      const messagesParams = [
        { name: 'conversationId', value: { longValue: conversationId } }
      ];
      const messages = await executeSQL(messagesQuery, messagesParams);
      
      
      initialMessages = messages.map(msg => {
        const mapped = {
          id: ensureRDSNumber(msg.id).toString(), // Convert serial ID to string if needed by Chat component
          content: ensureRDSString(msg.content),
          role: ensureRDSString(msg.role) as "user" | "assistant",
          // Handle both snake_case and camelCase field names (data-api-adapter may convert)
          modelId: msg.modelId !== undefined ? ensureRDSNumber(msg.modelId) : 
                   msg.model_id !== undefined ? ensureRDSNumber(msg.model_id) : null,
          modelName: msg.modelName || msg.model_name ? ensureRDSString(msg.modelName || msg.model_name) : null,
          modelProvider: msg.modelProvider || msg.model_provider ? ensureRDSString(msg.modelProvider || msg.model_provider) : null,
          modelIdentifier: msg.modelIdentifier || msg.model_identifier ? ensureRDSString(msg.modelIdentifier || msg.model_identifier) : null,
          reasoningContent: msg.reasoningContent || msg.reasoning_content ? ensureRDSString(msg.reasoningContent || msg.reasoning_content) : null,
          tokenUsage: (msg.tokenUsage || msg.token_usage) ? JSON.parse(ensureRDSString(msg.tokenUsage || msg.token_usage)) : null
        };
        return mapped;
      });
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