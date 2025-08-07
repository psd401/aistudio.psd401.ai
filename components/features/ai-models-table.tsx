'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import type { SelectAiModel } from '@/types';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  Column,
} from '@tanstack/react-table';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';

interface ModelFormProps {
  modelData: ModelFormData;
  setModelData: (data: ModelFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

const ModelForm = React.memo(function ModelForm({ 
  modelData, 
  setModelData, 
  onSubmit, 
  onCancel, 
  isEditing 
}: ModelFormProps) {
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setModelData({ ...modelData, name: e.target.value });
    
  const handleProviderChange = (value: string) => 
    setModelData({ ...modelData, provider: value });
    
  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setModelData({ ...modelData, modelId: e.target.value });
    
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => 
    setModelData({ ...modelData, description: e.target.value });
    
  const handleRolesChange = (roles: string[]) =>
    setModelData({ ...modelData, allowedRoles: roles });
    
  const handleCapabilitiesListChange = (capabilities: string[]) =>
    setModelData({ ...modelData, capabilitiesList: capabilities });
    
  const handleMaxTokensChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setModelData({ ...modelData, maxTokens: parseInt(e.target.value) || 4096 });
    
  const handleActiveChange = (checked: boolean) => 
    setModelData({ ...modelData, active: checked });
    
    
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={modelData.name}
            onChange={handleNameChange}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <Select
            value={modelData.provider || ''}
            onValueChange={handleProviderChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="azure">Azure OpenAI</SelectItem>
              <SelectItem value="amazon-bedrock">Amazon Bedrock</SelectItem>
              <SelectItem value="google">Google AI</SelectItem>
              <SelectItem value="google-vertex">Google Vertex AI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Model ID</label>
        <Input
          value={modelData.modelId}
          onChange={handleModelIdChange}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={modelData.description || ''}
          onChange={handleDescriptionChange}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Capabilities</label>
        <MultiSelect
          options={capabilityOptions}
          value={modelData.capabilitiesList}
          onChange={handleCapabilitiesListChange}
          placeholder="Select capabilities"
          allowCustom={true}
          customPlaceholder="Add custom capability..."
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Select model capabilities or add custom ones
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Allowed Roles</label>
        <MultiSelect
          options={roleOptions}
          value={modelData.allowedRoles}
          onChange={handleRolesChange}
          placeholder="All roles (unrestricted)"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to allow access for all roles
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Max Tokens</label>
          <Input
            type="number"
            value={modelData.maxTokens?.toString() || '4096'}
            onChange={handleMaxTokensChange}
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Switch
            checked={modelData.active}
            onCheckedChange={handleActiveChange}
          />
          <label className="text-sm font-medium">Active</label>
        </div>
      </div>

      <div className="flex space-x-2 pt-4">
        <Button onClick={onSubmit}>{isEditing ? 'Update' : 'Add'} Model</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
});

interface AiModelsTableProps {
  models: SelectAiModel[];
  onAddModel?: (model: Omit<SelectAiModel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateModel?: (modelId: number, updates: Partial<SelectAiModel>) => Promise<void>;
  onDeleteModel?: (modelId: number) => Promise<void>;
}

type ModelFormData = {
  name: string;
  provider: string;
  modelId: string;
  description: string;
  capabilities: string;
  maxTokens: number;
  active: boolean;
  allowedRoles: string[];
  capabilitiesList: string[];
};

const emptyModel: ModelFormData = {
  name: '',
  provider: '',
  modelId: '',
  description: '',
  capabilities: '',
  maxTokens: 4096,
  active: true,
  allowedRoles: [],
  capabilitiesList: []
};

// Predefined role options
const roleOptions: MultiSelectOption[] = [
  { value: 'administrator', label: 'Administrator', description: 'Full system access' },
  { value: 'staff', label: 'Staff', description: 'Staff member access' },
  { value: 'student', label: 'Student', description: 'Basic user access' },
];

// Common AI model capabilities
const capabilityOptions: MultiSelectOption[] = [
  { value: 'chat', label: 'Chat', description: 'General conversation' },
  { value: 'code_interpreter', label: 'Code Interpreter', description: 'Execute code' },
  { value: 'web_search', label: 'Web Search', description: 'Search the internet' },
  { value: 'image_generation', label: 'Image Generation', description: 'Create images' },
  { value: 'image_analysis', label: 'Image Analysis', description: 'Analyze images' },
  { value: 'file_analysis', label: 'File Analysis', description: 'Process documents' },
  { value: 'function_calling', label: 'Function Calling', description: 'Use tools/functions' },
  { value: 'json_mode', label: 'JSON Mode', description: 'Structured JSON output' },
];

export const AiModelsTable = React.memo(function AiModelsTable({ 
  models, 
  onAddModel, 
  onDeleteModel, 
  onUpdateModel 
}: AiModelsTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModel, setEditingModel] = useState<SelectAiModel | null>(null);
  const [modelData, setModelData] = useState<ModelFormData>(emptyModel);
  const [sorting, setSorting] = useState<SortingState>([]);
  
  // Memoized column header component to prevent recreation on each render
  const SortableColumnHeader = useCallback(({
    column,
    title,
    className = ""
  }: {
    column: Column<SelectAiModel, unknown>;
    title: string;
    className?: string;
  }) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className={`hover:bg-transparent px-0 ${className}`}
    >
      {title}
      {column.getIsSorted() === "asc" ? (
        <IconChevronUp className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === "desc" ? (
        <IconChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <IconSelector className="ml-2 h-4 w-4" />
      )}
    </Button>
  ), []);

  // Event handler for toggling active status
  const handleActiveToggle = useCallback((id: number, checked: boolean) => {
    onUpdateModel?.(id, { active: checked });
  }, [onUpdateModel]);

  // Event handler for toggling chat enabled status

  // Event handler for edit button
  const handleEditClick = useCallback((model: SelectAiModel) => {
    setEditingModel(model);
    
    // Parse capabilities if it's a JSON string
    let capabilitiesList: string[] = [];
    if (model.capabilities) {
      try {
        const parsed = typeof model.capabilities === 'string' 
          ? JSON.parse(model.capabilities) 
          : model.capabilities;
        if (Array.isArray(parsed)) {
          capabilitiesList = parsed;
        } else {
          // If it's not an array but valid JSON (e.g., an object), 
          // show it as a custom item that can be cleared
          capabilitiesList = [JSON.stringify(parsed)];
        }
      } catch {
        // If not valid JSON, show the raw string as a custom item
        if (typeof model.capabilities === 'string' && model.capabilities.trim()) {
          capabilitiesList = [model.capabilities];
        } else {
          capabilitiesList = [];
        }
      }
    }
    
    // Parse allowed roles if it's a JSON string
    let allowedRoles: string[] = [];
    if (model.allowedRoles) {
      try {
        const parsed = typeof model.allowedRoles === 'string' 
          ? JSON.parse(model.allowedRoles) 
          : model.allowedRoles;
        if (Array.isArray(parsed)) {
          allowedRoles = parsed;
        }
      } catch {
        // If not valid JSON, treat as empty
        allowedRoles = [];
      }
    }
    
    setModelData({
      name: model.name,
      provider: model.provider || '',
      modelId: model.modelId,
      description: model.description || '',
      capabilities: model.capabilities || '',
      capabilitiesList,
      allowedRoles,
      maxTokens: model.maxTokens || 4096,
      active: model.active,
    });
  }, []);

  // Event handler for delete button
  const handleDeleteClick = useCallback((id: number) => {
    onDeleteModel?.(id);
  }, [onDeleteModel]);

  const columns = useMemo<ColumnDef<SelectAiModel>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableColumnHeader column={column} title="Name" />,
      },
      {
        accessorKey: 'provider',
        header: ({ column }) => <SortableColumnHeader column={column} title="Provider" />,
      },
      {
        accessorKey: 'modelId',
        header: ({ column }) => <SortableColumnHeader column={column} title="Model ID" />,
      },
      {
        accessorKey: 'description',
        header: ({ column }) => <SortableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => {
          const description = row.getValue('description') as string;
          return description ? (
            <div className="max-w-xs truncate" title={description}>
              {description}
            </div>
          ) : null;
        },
      },
      {
        accessorKey: 'capabilities',
        header: 'Capabilities',
        cell: ({ row }) => {
          const capabilities = row.original.capabilities;
          if (!capabilities) return null;
          
          try {
            const capList = typeof capabilities === 'string' ? JSON.parse(capabilities) : capabilities;
            if (Array.isArray(capList) && capList.length > 0) {
              return (
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {capList.slice(0, 3).map((cap, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {cap}
                    </Badge>
                  ))}
                  {capList.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{capList.length - 3}
                    </Badge>
                  )}
                </div>
              );
            }
          } catch {
            // If not valid JSON, just show as text
            return <span className="text-xs text-muted-foreground">{capabilities}</span>;
          }
          return null;
        },
      },
      {
        accessorKey: 'allowedRoles',
        header: 'Roles',
        cell: ({ row }) => {
          const roles = row.original.allowedRoles;
          if (!roles) return <span className="text-xs text-muted-foreground">All roles</span>;
          
          try {
            const roleList = typeof roles === 'string' ? JSON.parse(roles) : roles;
            if (Array.isArray(roleList) && roleList.length > 0) {
              return (
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {roleList.map((role, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>
              );
            }
          } catch {
            // If not valid JSON, just show as text
            return <span className="text-xs text-muted-foreground">{roles}</span>;
          }
          return <span className="text-xs text-muted-foreground">All roles</span>;
        },
      },
      {
        accessorKey: 'maxTokens',
        header: ({ column }) => (
          <SortableColumnHeader column={column} title="Max Tokens" className="text-right w-full" />
        ),
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
              checked={row.getValue('active') as boolean}
              onCheckedChange={(checked) => handleActiveToggle(row.original.id, checked)}
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
              onClick={() => handleEditClick(row.original)}
              className="text-blue-500 hover:text-blue-600"
            >
              <IconEdit size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(row.original.id)}
              className="text-destructive hover:text-destructive/90"
            >
              <IconTrash size={16} />
            </Button>
          </div>
        ),
      },
    ],
    [SortableColumnHeader, handleActiveToggle, handleEditClick, handleDeleteClick]
  );

  const table = useReactTable({
    data: models || [],
    columns,
    state: {
      sorting,
    },
    enableMultiSort: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleSubmit = useCallback(() => {
    // Convert arrays to JSON strings for database storage
    const dataToSubmit = {
      ...modelData,
      capabilities: modelData.capabilitiesList.length > 0 
        ? JSON.stringify(modelData.capabilitiesList) 
        : null,
      allowedRoles: modelData.allowedRoles.length > 0 
        ? JSON.stringify(modelData.allowedRoles) 
        : null
    };
    
    // Remove the list fields as they're not part of the database schema
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { capabilitiesList, allowedRoles, ...dbData } = dataToSubmit;
    const finalData = {
      ...dbData,
      capabilities: dataToSubmit.capabilities,
      allowedRoles: dataToSubmit.allowedRoles,
      // Set chatEnabled based on whether "chat" is in capabilities
      chatEnabled: modelData.capabilitiesList.includes('chat')
    };
    
    if (editingModel) {
      onUpdateModel?.(editingModel.id, finalData);
      setEditingModel(null);
    } else {
      onAddModel?.(finalData);
      setShowAddForm(false);
    }
    setModelData(emptyModel);
  }, [editingModel, modelData, onUpdateModel, onAddModel]);

  const handleCancel = useCallback(() => {
    setShowAddForm(false);
    setEditingModel(null);
    setModelData(emptyModel);
  }, []);

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
}); 