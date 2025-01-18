'use client';

import { useEffect, useState } from 'react';
import { Card, Group, Select, Textarea, Button } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>, model: string) => void;
  isLoading: boolean;
}

interface Model {
  id: number;
  name: string;
  modelId: string;
  active: boolean;
}

export function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: ChatInputProps) {
  const [models, setModels] = useState<{ value: string; label: string; }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  useEffect(() => {
    const loadModels = async () => {
      try {
        setIsLoadingModels(true);
        const response = await fetch('/api/chat/models');
        if (!response.ok) {
          throw new Error(`Failed to load models: ${response.statusText}`);
        }
        const data: Model[] = await response.json();
        const activeBedrockModels = data
          .filter(m => m.active && m.modelId.startsWith('anthropic.claude'))
          .map(m => ({
            value: m.modelId,
            label: m.name
          }));
        
        if (activeBedrockModels.length === 0) {
          throw new Error('No active Claude models found');
        }
        
        setModels(activeBedrockModels);
        setSelectedModel(activeBedrockModels[0].value);
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: error instanceof Error ? error.message : 'Failed to load models',
          color: 'red'
        });
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedModel || !input.trim()) return;
    
    try {
      await handleSubmit(e, selectedModel);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to send message',
        color: 'red'
      });
    }
  };

  return (
    <Card component="form" onSubmit={onSubmit} withBorder p="md">
      <Group gap="sm">
        <Select
          data={models}
          value={selectedModel}
          onChange={setSelectedModel}
          placeholder="Select model"
          style={{ width: '200px' }}
          disabled={isLoading || isLoadingModels}
          error={models.length === 0 && !isLoadingModels ? 'No models available' : undefined}
        />
        <Textarea
          placeholder="Type your message... (Shift+Enter for new line)"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isLoading && input.trim() && selectedModel) {
                onSubmit(e as any);
              }
            }
          }}
          style={{ flex: 1 }}
          disabled={isLoading || !selectedModel || isLoadingModels}
          error={!selectedModel && !isLoadingModels ? 'Please select a model' : undefined}
          autosize
          minRows={1}
          maxRows={5}
        />
        <Button 
          type="submit" 
          rightSection={<IconSend size={16} />}
          loading={isLoading}
          disabled={!input.trim() || !selectedModel || isLoadingModels}
        >
          Send
        </Button>
      </Group>
    </Card>
  );
} 