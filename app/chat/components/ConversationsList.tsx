'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconMessage, IconPlus } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

export function ConversationsList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/chat/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const handleNewChat = () => {
    router.push('/chat');
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="outline"
        onClick={handleNewChat}
        className="flex items-center gap-2"
      >
        <IconPlus className="h-4 w-4" />
        New Chat
      </Button>

      <div className="space-y-1">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">
            No conversations yet
          </p>
        ) : (
          conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/chat/${conversation.id}`}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent",
                pathname === `/chat/${conversation.id}` && "bg-accent"
              )}
            >
              <IconMessage className="h-4 w-4" />
              <span className="truncate">{conversation.title}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
} 