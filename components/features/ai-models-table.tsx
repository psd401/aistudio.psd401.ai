'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, useMemo } from 'react';
import type { AiModel } from '~/lib/schema';
import type { SelectAiModel } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { ModelForm } from './model-form';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';

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
      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Max Tokens</label>
          <Input
            type="number"
            value={modelData.maxTokens}
            onChange={(e) => setModelData({ ...modelData, maxTokens: parseInt(e.target.value) || 4096 })}
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Switch
            checked={modelData.active}
            onCheckedChange={(checked) => setModelData({ ...modelData, active: checked })}
          />
          <label className="text-sm font-medium">Active</label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            checked={modelData.chatEnabled}
            onCheckedChange={(checked) => setModelData({ ...modelData, chatEnabled: checked })}
          />
          <label className="text-sm font-medium">Chat Enabled</label>
        </div>
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
  chatEnabled: false,
};

export function AiModelsTable({ models, onAddModel, onDeleteModel, onUpdateModel }: AiModelsTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModel, setEditingModel] = useState<SelectAiModel | null>(null);
  const [modelData, setModelData] = useState<ModelFormData>(emptyModel);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<SelectAiModel>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="hover:bg-transparent px-0"
            >
              Name
              {column.getIsSorted() === "asc" ? (
                <IconChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <IconChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <IconSelector className="ml-2 h-4 w-4" />
              )}
            </Button>
          )
        },
      },
      {
        accessorKey: 'provider',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="hover:bg-transparent px-0"
            >
              Provider
              {column.getIsSorted() === "asc" ? (
                <IconChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <IconChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <IconSelector className="ml-2 h-4 w-4" />
              )}
            </Button>
          )
        },
      },
      {
        accessorKey: 'modelId',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="hover:bg-transparent px-0"
            >
              Model ID
              {column.getIsSorted() === "asc" ? (
                <IconChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <IconChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <IconSelector className="ml-2 h-4 w-4" />
              )}
            </Button>
          )
        },
      },
      {
        accessorKey: 'description',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="hover:bg-transparent px-0"
            >
              Description
              {column.getIsSorted() === "asc" ? (
                <IconChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <IconChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <IconSelector className="ml-2 h-4 w-4" />
              )}
            </Button>
          )
        },
      },
      {
        accessorKey: 'maxTokens',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="hover:bg-transparent text-right w-full px-0"
            >
              Max Tokens
              {column.getIsSorted() === "asc" ? (
                <IconChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <IconChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <IconSelector className="ml-2 h-4 w-4" />
              )}
            </Button>
          )
        },
        cell: ({ row }) => {
          const value = row.getValue('maxTokens') as number;
          return <div className="text-right font-mono">{value?.toLocaleString()}</div>;
        },
      },
      {
        accessorKey: 'active',
        header: 'Active',
        cell: ({ row }) => (
          <div className="text-center">
            <Switch
              checked={row.getValue('active')}
              onCheckedChange={(checked) => onUpdateModel(row.original.id, { active: checked })}
            />
          </div>
        ),
      },
      {
        accessorKey: 'chatEnabled',
        header: 'Chat',
        cell: ({ row }) => (
          <div className="text-center">
            <Switch
              checked={row.getValue('chatEnabled')}
              onCheckedChange={(checked) => onUpdateModel(row.original.id, { chatEnabled: checked })}
            />
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex justify-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEdit(row.original)}
              className="text-blue-500 hover:text-blue-600"
            >
              <IconEdit size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDeleteModel(row.original.id)}
              className="text-destructive hover:text-destructive/90"
            >
              <IconTrash size={16} />
            </Button>
          </div>
        ),
      },
    ],
    [onUpdateModel, onDeleteModel]
  );

  const table = useReactTable({
    data: models,
    columns,
    state: {
      sorting,
    },
    enableMultiSort: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
      chatEnabled: model.chatEnabled,
    });
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingModel(null);
    setModelData(emptyModel);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSorting([])}
            className="text-xs"
            disabled={sorting.length === 0}
          >
            Reset Sort
          </Button>
          {sorting.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Hold Shift to sort by multiple columns
            </span>
          )}
        </div>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted hover:bg-muted">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow 
                  key={row.id}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No models found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 