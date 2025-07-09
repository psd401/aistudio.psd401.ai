import { redirect } from 'next/navigation';
import { SimpleChat } from '../_components/simple-chat';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL } from '@/lib/db/data-api-adapter';

interface ConversationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
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
  
  // Await the params object
  const resolvedParams = await params;
  const conversationId = parseInt(resolvedParams.id);
  
  // First get the conversation
  const conversationQuery = `
    SELECT id, title
    FROM conversations
    WHERE id = :conversationId
      AND user_id = :userId
    LIMIT 1
  `;
  const conversationParams = [
    { name: 'conversationId', value: { longValue: conversationId } },
    { name: 'userId', value: { stringValue: userId } }
  ];
  const conversationResult = await executeSQL(conversationQuery, conversationParams);
  const conversation = conversationResult[0];

  if (!conversation) {
    redirect('/chat');
  }

  // Then get the messages
  const messagesQuery = `
    SELECT id, content, role, created_at
    FROM messages
    WHERE conversation_id = :conversationId
    ORDER BY created_at ASC
  `;
  const messagesParams = [
    { name: 'conversationId', value: { longValue: conversationId } }
  ];
  const conversationMessages = await executeSQL(messagesQuery, messagesParams);

  return (
    <SimpleChat
      conversationId={conversation.id}
      initialMessages={conversationMessages.map(msg => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role,
        createdAt: msg.created_at ? new Date(msg.created_at).toISOString() : new Date().toISOString(),
      }))}
    />
  );
} 