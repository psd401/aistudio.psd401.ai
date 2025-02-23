'use client';

import { useState } from 'react';
import { AiModelsTable } from './ai-models-table';
import type { SelectAiModel } from '@/types';
import { useToast } from '@/components/ui/use-toast';

interface AiModelsClientProps {
  initialModels: SelectAiModel[];
}

export function AiModelsClient({ initialModels }: AiModelsClientProps) {
  const [models, setModels] = useState(initialModels);
  const { toast } = useToast();

  const handleAddModel = async (model: Omit<SelectAiModel, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('Sending model data to API:', model);
      const response = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        throw new Error(errorText || 'Failed to add model');
      }

      const newModel = await response.json();
      console.log('Received new model from API:', newModel);
      setModels([...models, newModel]);
      toast({
        title: 'Success',
        description: 'AI model added successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error adding model:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add AI model',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateModel = async (modelId: number, updates: Partial<SelectAiModel>) => {
    try {
      console.log('Sending update data to API:', { id: modelId, ...updates });
      const response = await fetch('/api/admin/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modelId, ...updates }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        throw new Error(errorText || 'Failed to update model');
      }

      const updatedModel = await response.json();
      console.log('Received updated model from API:', updatedModel);
      setModels(models.map(model => 
        model.id === modelId ? updatedModel : model
      ));
      toast({
        title: 'Success',
        description: 'AI model updated successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating model:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update AI model',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteModel = async (modelId: number) => {
    try {
      console.log('Sending delete request for model:', modelId);
      const response = await fetch(`/api/admin/models?id=${modelId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        throw new Error(errorText || 'Failed to delete model');
      }

      console.log('Model deleted successfully');
      setModels(models.filter(model => model.id !== modelId));
      toast({
        title: 'Success',
        description: 'AI model deleted successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error deleting model:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete AI model',
        variant: 'destructive',
      });
    }
  };

  return (
    <AiModelsTable
      models={models}
      onAddModel={handleAddModel}
      onDeleteModel={handleDeleteModel}
      onUpdateModel={handleUpdateModel}
    />
  );
} 