'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { IconPlayerStop } from '@tabler/icons-react';
import { Message } from './message';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import type { FormEvent } from 'react';

interface SimpleChatProps {
  conversationId?: number;
  initialMessages?: Array<{
    id: string;
    content: string;
    role: "user" | "assistant";
    createdAt?: string;
  }>;
}

export function SimpleChat({ conversationId, initialMessages = [] }: SimpleChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const { messages, input, handleInputChange, handleSubmit: handleChatSubmit, isLoading, reload, stop } = useChat({
    api: '/api/chat/stream-final',
    id: conversationId?.toString(),
    initialMessages: initialMessages.map(msg => ({
      id: msg.id,
      content: msg.content,
      role: msg.role as 'user' | 'assistant'
    })),
    body: {
      conversationId,
    },
    // Remove streamProtocol - let it use default for v5
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
    const abortController = new AbortController();
    
    async function loadConversation() {
      if (!conversationId) return;
      
      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`, {
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error('Failed to load conversation');
        }
        const messages = await response.json();
        reload(messages);
      } catch (error) {
        // Don't show toast if the request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        toast({
          title: 'Error',
          description: 'Failed to load conversation history',
          variant: 'destructive',
        });
      }
    }
    
    if (conversationId) {
      loadConversation();
    }
    
    return () => {
      abortController.abort();
    };
  }, [conversationId, reload, toast]);

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await handleChatSubmit(e);
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

  // Auto-focus handled by ChatInput component

  return (
    <div className="flex flex-col h-full relative">
      <ScrollArea ref={scrollRef} className="flex-1 h-[calc(100vh-180px)] p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <Message 
              key={message.id} 
              message={message} // Pass the message directly - Message component handles conversion
            />
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
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}