'use client';

import { Stack, Button, Text, ScrollArea, Group, ActionIcon, TextInput } from '@mantine/core';
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from '@tabler/icons-react';
import { Conversation } from '@/lib/schema';
import { useState } from 'react';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  onSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onDelete?: (conversationId: number) => void;
}

export default function ConversationsList({
  conversations,
  selectedConversation,
  onSelect,
  onNewConversation,
  onDelete,
}: ConversationsListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSave = async (conv: Conversation) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle }),
      });
      
      if (response.ok) {
        const updatedConv = { ...conv, title: editTitle };
        onSelect(updatedConv);
      }
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
    setEditingId(null);
  };

  const handleDelete = async (conv: Conversation) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conv.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        if (selectedConversation?.id === conv.id) {
          onNewConversation();
        }
        onDelete?.(conv.id);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  return (
    <Stack h="100%" gap="sm" p="md">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        onClick={onNewConversation}
      >
        New Chat
      </Button>
      <ScrollArea h="calc(100% - 60px)">
        <Stack gap="xs">
          {conversations.map((conv) => (
            <div key={conv.id} style={{ width: '100%' }}>
              {editingId === conv.id ? (
                <Group wrap="nowrap" style={{ width: '100%' }}>
                  <TextInput
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <ActionIcon variant="filled" color="green" onClick={() => handleSave(conv)}>
                    <IconCheck size={16} />
                  </ActionIcon>
                  <ActionIcon variant="filled" color="red" onClick={() => setEditingId(null)}>
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ) : (
                <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
                  <Button
                    variant={selectedConversation?.id === conv.id ? "filled" : "subtle"}
                    onClick={() => onSelect(conv)}
                    styles={{
                      root: {
                        flex: 1,
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                        whiteSpace: 'normal',
                        height: 'auto',
                        minHeight: 36,
                        padding: '8px 12px',
                        wordBreak: 'break-word'
                      },
                      label: {
                        whiteSpace: 'normal'
                      }
                    }}
                  >
                    {conv.title}
                  </Button>
                  <Group gap={4}>
                    <ActionIcon variant="subtle" onClick={() => handleEdit(conv)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(conv)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <Text c="dimmed" ta="center" pt="xl">
              No conversations yet
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
} 