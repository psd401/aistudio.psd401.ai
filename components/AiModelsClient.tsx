'use client';

import { useState } from 'react';
import { AiModelsTable } from './AiModelsTable';
import type { AiModel } from '~/lib/schema';
import { notifications } from '@mantine/notifications';

export function AiModelsClient({ initialModels }: { initialModels: AiModel[] }) {
  const [models, setModels] = useState<AiModel[]>(initialModels);

  const handleAddModel = async (model: Omit<AiModel, 'id' | 'createdAt' | 'updatedAt'>) => {
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
      notifications.show({
        title: 'Success',
        message: 'AI model added successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Error adding model:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to add AI model',
        color: 'red',
      });
    }
  };

  const handleUpdateModel = async (modelId: number, updates: Partial<AiModel>) => {
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
      notifications.show({
        title: 'Success',
        message: 'AI model updated successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Error updating model:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update AI model',
        color: 'red',
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
      notifications.show({
        title: 'Success',
        message: 'AI model deleted successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Error deleting model:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete AI model',
        color: 'red',
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