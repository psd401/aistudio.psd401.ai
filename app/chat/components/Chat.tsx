'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useChat } from 'ai/react';
import { IconReload, IconPlayerStop, IconPlus } from '@tabler/icons-react';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import type { FormEvent } from 'react';

interface ChatProps {
  conversationId?: number;
}

export function Chat({ conversationId }: ChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
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
        toast({
          title: 'Error',
          description: `Failed to send message: ${response.statusText}`,
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred while sending your message',
        variant: 'destructive',
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
      toast({
        title: 'Error',
        description: 'Failed to load conversation history',
        variant: 'destructive',
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
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    }
  }, [handleChatSubmit, toast]);

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
    <div className="flex flex-col h-full relative">
      <ScrollArea ref={scrollRef} className="flex-1 h-[calc(100vh-180px)] p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground">
              Start a new conversation by typing a message
            </div>
          )}
        </div>
      </ScrollArea>

      {isLoading && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-36 right-6 z-50"
          onClick={() => stop()}
        >
          <IconPlayerStop className="h-5 w-5" />
        </Button>
      )}

      <ChatInput
        ref={inputRef}
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />

      <Button
        size="icon"
        className="fixed bottom-24 right-6 h-12 w-12 rounded-full shadow-lg"
        onClick={() => handleSubmit(new Event('click') as any, '')}
      >
        <IconPlus className="h-6 w-6" />
      </Button>
    </div>
  );
} 