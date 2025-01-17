'use client';

import { useEffect, useRef, useState } from 'react';
import { Stack, Paper, Text, ScrollArea, Textarea, Button, Group, Select, ActionIcon, Tooltip } from '@mantine/core';
import { useChat } from 'ai/react';
import { IconSend, IconCopy, IconCheck } from '@tabler/icons-react';
import { Conversation, Message } from '@/lib/schema';
import { useUser } from '@clerk/nextjs';

interface ChatInterfaceProps {
  conversation: Conversation | null;
  onConversationCreated: (conversation: Conversation) => void;
}

export default function ChatInterface({
  conversation,
  onConversationCreated,
}: ChatInterfaceProps) {
  const { user } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [selectedModel, setSelectedModel] = useState('anthropic.claude-3-5-sonnet-20241022-v2:0');
  const [availableModels, setAvailableModels] = useState<Array<{ value: string; label: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setMessages,
  } = useChat({
    api: '/api/chat/messages',
    body: {
      conversationId: conversation?.id,
      modelId: selectedModel,
    },
    onFinish: async () => {
      setIsProcessing(false);
      
      // If this was the first message, reload the conversation list
      if (!conversation) {
        const response = await fetch('/api/chat/conversations');
        if (response.ok) {
          const conversations = await response.json();
          // Find the most recently created conversation
          const newConversation = conversations.sort((a: any, b: any) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          if (newConversation) {
            onConversationCreated(newConversation);
          }
        }
      }
    },
  });

  const handleMessageSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing || !input.trim()) return;
    
    setIsProcessing(true);
    await handleSubmit(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing && input.trim()) {
        handleMessageSubmit(e as any);
      }
    }
  };

  useEffect(() => {
    const loadModels = async () => {
      const response = await fetch('/api/admin/models');
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(
          data
            .filter((m: any) => m.active && m.modelId.startsWith('anthropic.claude'))
            .map((m: any) => ({
              value: m.modelId,
              label: m.name,
            }))
        );
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      if (conversation) {
        const response = await fetch(`/api/chat/conversations/${conversation.id}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(
            data.map((msg: Message) => ({
              id: msg.id.toString(),
              role: msg.role,
              content: msg.content,
            }))
          );
        }
      } else {
        setMessages([]);
      }
    };

    loadMessages();
  }, [conversation, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleCopy = async (content: string, messageId: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  return (
    <Stack h="100%" style={{ position: 'relative' }}>
      <ScrollArea h="calc(100vh - 180px)" viewportRef={scrollRef}>
        <Stack gap="md" p="md">
          {messages.length === 0 && !conversation && (
            <Text c="dimmed" ta="center" pt="xl">
              Start a new conversation by selecting a model and typing a message
            </Text>
          )}
          {messages.map((message) => {
            let displayContent = message.content;
            try {
              const parsed = JSON.parse(message.content);
              displayContent = parsed.content || parsed.messages?.[0]?.content || message.content;
            } catch {
              displayContent = message.content;
            }

            return (
              <Paper
                key={message.id}
                p="md"
                radius="md"
                style={{
                  backgroundColor: message.role === 'user' ? '#f8f9fa' : '#f5f5f5',
                  maxWidth: '80%',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  position: 'relative',
                }}
              >
                <Group align="flex-start" style={{ position: 'relative' }}>
                  <Text
                    size="sm"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {displayContent.split(/\n+/).map((paragraph, index) => (
                      <span key={index}>
                        {paragraph}
                        {index < displayContent.split(/\n+/).length - 1 && (
                          <>
                            <br />
                            <br />
                          </>
                        )}
                      </span>
                    ))}
                  </Text>
                  {message.role === 'assistant' && (
                    <Tooltip label={copiedMessageId === message.id ? "Copied!" : "Copy to clipboard"}>
                      <ActionIcon 
                        variant="subtle" 
                        onClick={() => handleCopy(displayContent, message.id)}
                        style={{ 
                          position: 'absolute',
                          top: 0,
                          right: -30,
                        }}
                      >
                        {copiedMessageId === message.id ? (
                          <IconCheck size={16} style={{ color: 'green' }} />
                        ) : (
                          <IconCopy size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </ScrollArea>
      <Paper p="md" radius="md" withBorder style={{ position: 'sticky', bottom: 0, backgroundColor: 'white' }}>
        <form onSubmit={handleMessageSubmit}>
          <Group gap="sm">
            <Select
              data={availableModels}
              value={selectedModel}
              onChange={(value) => setSelectedModel(value || selectedModel)}
              placeholder="Select model"
              style={{ width: '200px' }}
              disabled={conversation !== null || isProcessing}
            />
            <Textarea
              placeholder="Type your message... (Shift+Enter for new line)"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              style={{ flex: 1 }}
              disabled={isProcessing}
              autosize
              minRows={1}
              maxRows={5}
            />
            <Button 
              type="submit" 
              rightSection={<IconSend size={16} />}
              loading={isProcessing}
              disabled={!input.trim()}
            >
              Send
            </Button>
          </Group>
        </form>
      </Paper>
    </Stack>
  );
} 