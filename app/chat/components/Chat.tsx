'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Stack, ScrollArea, Group, Button, Text, ActionIcon } from '@mantine/core';
import { useChat } from 'ai/react';
import { notifications } from '@mantine/notifications';
import { IconReload, IconPlayerStop, IconPlus } from '@tabler/icons-react';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import type { FormEvent } from 'react';

interface ChatProps {
  conversationId?: number;
}

export function Chat({ conversationId }: ChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, input, handleInputChange, handleSubmit: handleChatSubmit, isLoading, error, reload, stop } = useChat({
    api: '/api/chat',
    id: conversationId?.toString(),
    body: {
      conversationId,
    },
    streamProtocol: 'text',
    maxSteps: 10,
    onResponse: (response) => {
      if (!response.ok) {
        notifications.show({
          title: 'Error',
          message: `Failed to send message: ${response.statusText}`,
          color: 'red',
          autoClose: 5000
        });
      }
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'An error occurred while sending your message',
        color: 'red',
        autoClose: 5000
      });
    },
    onFinish: () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  });

  useEffect(() => {
    if (conversationId) {
      loadConversation();
    }
  }, [conversationId]);

  async function loadConversation() {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }
      const messages = await response.json();
      reload(messages);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load conversation history',
        color: 'red'
      });
    }
  }

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>, model: string) => {
    e.preventDefault();
    try {
      await handleChatSubmit(e, {
        body: {
          model
        }
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to send message',
        color: 'red'
      });
    }
  }, [handleChatSubmit]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [messages]);

  return (
    <Stack style={{ height: '100%', position: 'relative' }}>
      <ScrollArea style={{ height: 'calc(100vh - 180px)', padding: '16px' }}>
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--mantine-color-gray-6)' }}>
            Start a new conversation by typing a message
          </div>
        )}
      </ScrollArea>

      {isLoading && (
        <ActionIcon
          variant="light"
          color="red"
          size="md"
          onClick={() => stop()}
          style={{
            position: 'absolute',
            bottom: '140px',
            right: '24px',
            zIndex: 1000
          }}
        >
          <IconPlayerStop size={20} />
        </ActionIcon>
      )}

      <ChatInput
        ref={inputRef}
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />

      <ActionIcon
        variant="filled"
        color="blue"
        size="xl"
        radius="xl"
        onClick={() => handleSubmit(new Event('click') as any, '')}
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        <IconPlus size={24} />
      </ActionIcon>
    </Stack>
  );
} 