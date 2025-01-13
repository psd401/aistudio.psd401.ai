'use client';

import { Group, Button, Table, TextInput, Select, NumberInput, Textarea, Switch, Modal, ActionIcon, Tooltip } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { AiModel } from '~/lib/schema';

interface ModelFormProps {
  modelData: ModelFormData;
  setModelData: (data: ModelFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

function ModelForm({ modelData, setModelData, onSubmit, onCancel, isEditing }: ModelFormProps) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Name"
        value={modelData.name}
        onChange={(e) => setModelData({ ...modelData, name: e.target.value })}
        required
      />
      <Select
        label="Provider"
        value={modelData.provider}
        onChange={(value) => setModelData({ ...modelData, provider: value || '' })}
        data={[
          { value: 'azure', label: 'Azure OpenAI' },
          { value: 'amazon-bedrock', label: 'Amazon Bedrock' },
          { value: 'google', label: 'Google AI' },
        ]}
        required
      />
      <TextInput
        label="Model ID"
        value={modelData.modelId}
        onChange={(e) => setModelData({ ...modelData, modelId: e.target.value })}
        required
      />
      <Textarea
        label="Description"
        value={modelData.description || ''}
        onChange={(e) => setModelData({ ...modelData, description: e.target.value })}
      />
      <Textarea
        label="Capabilities (JSON)"
        value={modelData.capabilities || ''}
        onChange={(e) => setModelData({ ...modelData, capabilities: e.target.value })}
        minRows={4}
        placeholder='{"tasks": ["chat"], "context_window": 128000}'
      />
      <NumberInput
        label="Max Tokens"
        value={modelData.maxTokens}
        onChange={(value) => setModelData({ ...modelData, maxTokens: value || 4096 })}
      />
      <Switch
        label="Active"
        checked={modelData.active}
        onChange={(e) => setModelData({ ...modelData, active: e.currentTarget.checked })}
      />
      <Group>
        <Button onClick={onSubmit}>{isEditing ? 'Update' : 'Add'} Model</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </Group>
    </div>
  );
}

interface AiModelsTableProps {
  models: AiModel[];
  onAddModel: (model: Omit<AiModel, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteModel: (modelId: number) => void;
  onUpdateModel: (modelId: number, updates: Partial<AiModel>) => void;
}

type ModelFormData = Omit<AiModel, 'id' | 'createdAt' | 'updatedAt'>;

const emptyModel: ModelFormData = {
  name: '',
  provider: '',
  modelId: '',
  description: '',
  capabilities: '',
  maxTokens: 4096,
  active: true,
};

export function AiModelsTable({ models, onAddModel, onDeleteModel, onUpdateModel }: AiModelsTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModel, setEditingModel] = useState<AiModel | null>(null);
  const [modelData, setModelData] = useState<ModelFormData>(emptyModel);

  const handleSubmit = () => {
    if (editingModel) {
      onUpdateModel(editingModel.id, modelData);
      setEditingModel(null);
    } else {
      onAddModel(modelData);
      setShowAddForm(false);
    }
    setModelData(emptyModel);
  };

  const handleEdit = (model: AiModel) => {
    setEditingModel(model);
    setModelData({
      name: model.name,
      provider: model.provider,
      modelId: model.modelId,
      description: model.description || '',
      capabilities: model.capabilities || '',
      maxTokens: model.maxTokens || 4096,
      active: model.active,
    });
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingModel(null);
    setModelData(emptyModel);
  };

  return (
    <div className="space-y-8">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => setShowAddForm(true)}
        >
          Add Model
        </Button>
      </Group>

      <Modal 
        opened={showAddForm || editingModel !== null} 
        onClose={handleCancel}
        title={editingModel ? 'Edit Model' : 'Add New Model'}
        size="lg"
      >
        <ModelForm
          modelData={modelData}
          setModelData={setModelData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isEditing={!!editingModel}
        />
      </Modal>

      <Table withTableBorder withColumnBorders withRowBorders highlightOnHover>
        <thead>
          <tr>
            <th style={{ width: '15%', padding: '12px 16px' }}>Name</th>
            <th style={{ width: '12%', padding: '12px 16px' }}>Provider</th>
            <th style={{ width: '20%', padding: '12px 16px' }}>Model ID</th>
            <th style={{ width: '25%', padding: '12px 16px' }}>Description</th>
            <th style={{ width: '10%', padding: '12px 16px', textAlign: 'right' }}>Max Tokens</th>
            <th style={{ width: '8%', padding: '12px 16px', textAlign: 'center' }}>Status</th>
            <th style={{ width: '10%', padding: '12px 16px', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <td style={{ padding: '12px 16px' }}>{model.name}</td>
              <td style={{ padding: '12px 16px' }}>{model.provider}</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.9em' }}>{model.modelId}</td>
              <td style={{ padding: '12px 16px' }}>{model.description}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{model.maxTokens?.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                <Switch
                  checked={model.active}
                  onChange={(e) => onUpdateModel(model.id, { active: e.currentTarget.checked })}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <Group justify="center" gap="xs">
                  <Tooltip label="Edit">
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      onClick={() => handleEdit(model)}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => onDeleteModel(model.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
} 