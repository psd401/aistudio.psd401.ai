import { useState } from 'react';
import { Stack, Text, ActionIcon, TextInput, Group, Paper, Title } from '@mantine/core';
import { IconTrash, IconEdit, IconCheck, IconX, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface Conversation {
  id: number;
  title: string;
  updatedAt: Date;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: number;
  onConversationSelect: (id: number) => void;
  onConversationDelete: (id: number) => Promise<void>;
  onConversationRename: (id: number, newTitle: string) => Promise<void>;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onConversationSelect,
  onConversationDelete,
  onConversationRename
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setNewTitle(conversation.title);
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await onConversationRename(id, newTitle);
      setEditingId(null);
      notifications.show({
        title: 'Success',
        message: 'Conversation renamed successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to rename conversation',
        color: 'red'
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await onConversationDelete(id);
      notifications.show({
        title: 'Success',
        message: 'Conversation deleted successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete conversation',
        color: 'red'
      });
    }
  };

  return (
    <Stack gap="xs" style={{ width: '240px', height: '100%', paddingLeft: 0 }}>
      <Title order={4} style={{ fontSize: '1rem', marginLeft: '4px' }}>Previous Conversations</Title>
      <Stack gap="xs" style={{ overflowY: 'auto' }}>
        {conversations.map((conversation) => (
          <Paper
            key={conversation.id}
            shadow="xs"
            p="xs"
            withBorder
            style={{
              cursor: 'pointer',
              backgroundColor: activeConversationId === conversation.id ? 'var(--mantine-color-blue-0)' : undefined,
              position: 'relative',
              minWidth: 0
            }}
            onClick={() => onConversationSelect(conversation.id)}
          >
            {editingId === conversation.id ? (
              <Group gap="xs">
                <TextInput
                  size="xs"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ flex: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveEdit(conversation.id);
                    }
                  }}
                />
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="green"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveEdit(conversation.id);
                  }}
                >
                  <IconCheck size={14} />
                </ActionIcon>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                  }}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ) : (
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" style={{ 
                  flex: 1, 
                  whiteSpace: 'normal', 
                  wordBreak: 'break-word',
                  paddingRight: '60px'
                }}>{conversation.title}</Text>
                <Group gap={4} className="hover-visible" style={{ 
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--mantine-color-body)',
                  padding: '0 4px',
                  borderRadius: '4px',
                  boxShadow: '0 0 4px rgba(0,0,0,0.1)'
                }}>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(conversation);
                    }}
                  >
                    <IconEdit size={14} />
                  </ActionIcon>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(conversation.id);
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            )}
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
} 