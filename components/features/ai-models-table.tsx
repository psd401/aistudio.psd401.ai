'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { AiModel } from '~/lib/schema';
import type { SelectAiModel } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { ModelForm } from './model-form';

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
      <div className="space-y-2">
        <label className="text-sm font-medium">Name</label>
        <Input
          value={modelData.name}
          onChange={(e) => setModelData({ ...modelData, name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Provider</label>
        <Select
          value={modelData.provider}
          onValueChange={(value) => setModelData({ ...modelData, provider: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="azure">Azure OpenAI</SelectItem>
            <SelectItem value="amazon-bedrock">Amazon Bedrock</SelectItem>
            <SelectItem value="google">Google AI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Model ID</label>
        <Input
          value={modelData.modelId}
          onChange={(e) => setModelData({ ...modelData, modelId: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={modelData.description || ''}
          onChange={(e) => setModelData({ ...modelData, description: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Capabilities (JSON)</label>
        <Textarea
          value={modelData.capabilities || ''}
          onChange={(e) => setModelData({ ...modelData, capabilities: e.target.value })}
          className="font-mono"
          rows={4}
          placeholder='{"tasks": ["chat"], "context_window": 128000}'
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Max Tokens</label>
        <Input
          type="number"
          value={modelData.maxTokens}
          onChange={(e) => setModelData({ ...modelData, maxTokens: parseInt(e.target.value) || 4096 })}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={modelData.active}
          onCheckedChange={(checked) => setModelData({ ...modelData, active: checked })}
        />
        <label className="text-sm font-medium">Active</label>
      </div>

      <div className="flex space-x-2 pt-4">
        <Button onClick={onSubmit}>{isEditing ? 'Update' : 'Add'} Model</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface AiModelsTableProps {
  models: SelectAiModel[];
  onAddModel?: (model: Omit<SelectAiModel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateModel?: (modelId: number, updates: Partial<SelectAiModel>) => Promise<void>;
  onDeleteModel?: (modelId: number) => Promise<void>;
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
  const [editingModel, setEditingModel] = useState<SelectAiModel | null>(null);
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

  const handleEdit = (model: SelectAiModel) => {
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
      <div className="flex justify-end">
        <Button
          onClick={() => setShowAddForm(true)}
          className="flex items-center space-x-2"
        >
          <IconPlus size={16} />
          <span>Add Model</span>
        </Button>
      </div>

      <Dialog open={showAddForm || editingModel !== null} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingModel ? 'Edit Model' : 'Add New Model'}</DialogTitle>
          </DialogHeader>
          <ModelForm
            modelData={modelData}
            setModelData={setModelData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditing={!!editingModel}
          />
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%]">Name</TableHead>
            <TableHead className="w-[12%]">Provider</TableHead>
            <TableHead className="w-[20%]">Model ID</TableHead>
            <TableHead className="w-[25%]">Description</TableHead>
            <TableHead className="w-[10%] text-right">Max Tokens</TableHead>
            <TableHead className="w-[8%] text-center">Status</TableHead>
            <TableHead className="w-[10%] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((model) => (
            <TableRow key={String(model.id)}>
              <TableCell>{model.name}</TableCell>
              <TableCell>{model.provider}</TableCell>
              <TableCell className="font-mono text-sm">{model.modelId}</TableCell>
              <TableCell>{model.description}</TableCell>
              <TableCell className="text-right font-mono">{model.maxTokens?.toLocaleString()}</TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={model.active}
                  onCheckedChange={(checked) => onUpdateModel(model.id, { active: checked })}
                />
              </TableCell>
              <TableCell>
                <div className="flex justify-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(model)}
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <IconEdit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteModel(model.id)}
                    className="text-destructive hover:text-destructive/90"
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
} 