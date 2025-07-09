'use client';

import { useState, useCallback, memo } from 'react';
import { AiModelsTable } from './ai-models-table';
import type { SelectAiModel } from '@/types';
import { useToast } from '@/components/ui/use-toast';

interface AiModelsClientProps {
  initialModels: SelectAiModel[];
}

export const AiModelsClient = memo(function AiModelsClient({ initialModels = [] }: AiModelsClientProps) {
  const [models, setModels] = useState(initialModels);
  const { toast } = useToast();

  const handleAddModel = useCallback(async (model: Omit<SelectAiModel, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to add model');
      }

      const newModel = await response.json();
      setModels([...models, newModel.data]);
      toast({
        title: 'Success',
        description: 'AI model added successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add AI model',
        variant: 'destructive',
      });
    }
  }, [models, toast]);

  const handleUpdateModel = useCallback(async (modelId: number, updates: Partial<SelectAiModel>) => {
    try {
      const response = await fetch('/api/admin/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modelId, ...updates }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update model');
      }

      const updatedModel = await response.json();
      setModels(models.map(model => 
        model.id === modelId ? updatedModel.data : model
      ));
      toast({
        title: 'Success',
        description: 'AI model updated successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update AI model',
        variant: 'destructive',
      });
    }
  }, [models, toast]);

  const handleDeleteModel = useCallback(async (modelId: number) => {
    try {
      const response = await fetch(`/api/admin/models?id=${modelId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete model');
      }

      setModels(models.filter(model => model.id !== modelId));
      toast({
        title: 'Success',
        description: 'AI model deleted successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete AI model',
        variant: 'destructive',
      });
    }
  }, [models, toast]);

  return (
    <AiModelsTable
      models={models}
      onAddModel={handleAddModel}
      onDeleteModel={handleDeleteModel}
      onUpdateModel={handleUpdateModel}
    />
  );
}); 