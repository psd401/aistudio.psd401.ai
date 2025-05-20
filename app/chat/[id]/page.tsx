import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/db/db';
import { conversationsTable, messagesTable } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { Chat } from '../components/Chat';
import { hasToolAccess } from '@/utils/roles';

interface ConversationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { userId } = auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has access to the chat tool
  const hasAccess = await hasToolAccess(userId, "chat")
  if (!hasAccess) {
    redirect("/dashboard")
  }

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
    <Chat
      initialMessages={conversationMessages.map(msg => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role,
        createdAt: msg.createdAt.toISOString(),
      }))}
      conversationId={conversation.id}
    />
  );
} 