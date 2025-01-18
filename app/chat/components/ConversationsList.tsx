'use client';

import { useEffect, useState } from 'react';
import { Stack, Text, Button, NavLink } from '@mantine/core';
import { IconMessage, IconPlus } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';

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
    <Stack gap="md">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        onClick={handleNewChat}
      >
        New Chat
      </Button>

      <Stack gap="xs">
        {conversations.length === 0 ? (
          <Text c="dimmed" ta="center" size="sm">
            No conversations yet
          </Text>
        ) : (
          conversations.map((conversation) => (
            <NavLink
              key={conversation.id}
              component="a"
              href={`/chat/${conversation.id}`}
              label={conversation.title}
              leftSection={<IconMessage size={16} />}
              active={pathname === `/chat/${conversation.id}`}
            />
          ))
        )}
      </Stack>
    </Stack>
  );
} 