import { redirect } from 'next/navigation';
import { db } from '@/db/db';
import { conversationsTable, messagesTable } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { SimpleChat } from '../_components/simple-chat';
import { hasToolAccess } from '@/utils/roles';

interface ConversationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  // Await the params object
  const resolvedParams = await params;
  const conversationId = parseInt(resolvedParams.id);
  
  // First get the conversation
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.clerkId, userId)
      )
    );

  if (!conversation) {
    redirect('/chat');
  }

  // Then get the messages
  const conversationMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  return (
    <SimpleChat
      conversationId={conversation.id}
      initialMessages={conversationMessages.map(msg => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role,
        createdAt: msg.createdAt.toISOString(),
      }))}
    />
  );
} 