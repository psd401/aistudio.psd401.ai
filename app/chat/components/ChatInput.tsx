'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
      <div className="flex items-end gap-4 p-4 bg-background border-t">
        <Select
          value={selectedModel}
          onValueChange={setSelectedModel}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map(model => (
              <SelectItem key={model.id} value={model.modelId}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          ref={ref}
          placeholder="Type your message... (Shift+Enter for new line)"
          value={input}
          onChange={handleInputChange}
          className="flex-1 min-h-[40px] max-h-[200px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as any as FormEvent<HTMLFormElement>, selectedModel);
            }
          }}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            'Send'
          )}
        </Button>
      </div>
    </form>
  );
}); 