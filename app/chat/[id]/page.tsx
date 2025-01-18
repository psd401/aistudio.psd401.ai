import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { conversations } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';
import { Chat } from '../components/Chat';

interface ConversationPageProps {
  params: {
    id: string;
  };
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { userId } = auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const conversationId = parseInt(params.id);
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.clerkId, userId)
    ),
    with: {
      messages: {
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      },
    },
  });

  if (!conversation) {
    redirect('/chat');
  }

  return (
    <Chat
      initialMessages={conversation.messages.map(msg => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role,
        createdAt: msg.createdAt.toISOString(),
      }))}
      conversationId={conversation.id}
    />
  );
} 