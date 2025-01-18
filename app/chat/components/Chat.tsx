'use client';

import { useChat, type Message as MessageType } from 'ai/react';
import { Card, Stack, Text, ScrollArea, Group, Button } from '@mantine/core';
import { IconReload, IconPlayerStop } from '@tabler/icons-react';
import { Message as MessageComponent } from './Message';
import { ChatInput as ChatInputComponent } from './ChatInput';
import { useRef, useEffect, useCallback } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { notifications } from '@mantine/notifications';

interface ChatProps {
  initialMessages?: MessageType[];
  conversationId?: number;
}

export function Chat({ initialMessages = [], conversationId }: ChatProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: handleChatSubmit,
    isLoading,
    error,
    reload,
    stop,
  } = useChat({
    api: '/api/chat',
    id: conversationId?.toString(),
    initialMessages,
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
          behavior: 'smooth',
        });
      }
    }
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

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
        color: 'red',
        autoClose: 5000
      });
    }
  }, [handleChatSubmit]);

  return (
    <Stack h="100%" gap="md">
      <Card withBorder flex={1} p={0}>
        <ScrollArea h="calc(100vh - 200px)" viewportRef={scrollRef}>
          <Stack gap="md" p="md">
            {messages.length === 0 ? (
              <Text c="dimmed" ta="center" pt="xl">
                Start a new conversation by typing a message
              </Text>
            ) : (
              messages.map((message) => (
                <MessageComponent
                  key={message.id}
                  message={message}
                />
              ))
            )}
            {error && (
              <Text c="red" ta="center">
                {error.message || 'An error occurred. Please try again.'}
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Card>

      <Group justify="center" mb="xs">
        {isLoading && (
          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconPlayerStop size={16} />}
            onClick={() => stop()}
          >
            Stop Generating
          </Button>
        )}
        {error && (
          <Button
            variant="light"
            size="xs"
            leftSection={<IconReload size={16} />}
            onClick={() => reload()}
          >
            Retry
          </Button>
        )}
      </Group>

      <ChatInputComponent
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Stack>
  );
} 