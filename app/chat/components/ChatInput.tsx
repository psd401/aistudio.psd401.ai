'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Textarea, Group, Button, Select } from '@mantine/core';
import type { FormEvent } from 'react';

interface AIModel {
  id: number;
  modelId: string;
  name: string;
}

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>, model: string) => Promise<void>;
  isLoading: boolean;
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(({
  input,
  handleInputChange,
  handleSubmit,
  isLoading
}, ref) => {
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    async function loadModels() {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) throw new Error('Failed to load models');
        const data = await response.json();
        const bedrockModels = data.filter(m => m.provider === 'amazon-bedrock');
        setModels(bedrockModels);
        if (bedrockModels.length > 0) {
          setSelectedModel(bedrockModels[0].modelId);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    }
    loadModels();
  }, []);

  return (
    <form onSubmit={(e) => handleSubmit(e, selectedModel)}>
      <Group align="flex-end" style={{ padding: '16px', backgroundColor: 'var(--mantine-color-body)', borderTop: '1px solid var(--mantine-color-gray-3)' }}>
        <Select
          value={selectedModel}
          onChange={(value) => setSelectedModel(value || '')}
          data={models.map(model => ({ 
            value: model.modelId, 
            label: model.name 
          }))}
          style={{
            minWidth: '200px'
          }}
        />
        <Textarea
          ref={ref}
          placeholder="Type your message... (Shift+Enter for new line)"
          value={input}
          onChange={handleInputChange}
          style={{ flex: 1 }}
          autosize
          minRows={1}
          maxRows={5}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as any as FormEvent<HTMLFormElement>, selectedModel);
            }
          }}
        />
        <Button type="submit" loading={isLoading}>Send</Button>
      </Group>
    </form>
  );
}); 