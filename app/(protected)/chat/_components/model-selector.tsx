"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { IconChevronDown, IconRobot } from "@tabler/icons-react"
import type { SelectAiModel } from "@/types"

interface ModelSelectorProps {
  models: SelectAiModel[]
  selectedModel: SelectAiModel | null
  onModelSelect: (model: SelectAiModel) => void
}

export function ModelSelector({
  models,
  selectedModel,
  onModelSelect
}: ModelSelectorProps) {
  // Defensive check for models array - but don't add fake fallbacks
  const validModels = Array.isArray(models) ? models : [];
  
  // Group models by provider and sort alphabetically within each group
  const groupedModels = validModels.reduce<Record<string, SelectAiModel[]>>((acc, model) => {
    // Make sure model has a provider
    const provider = model.provider || 'unknown';
    
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {});

  // Sort providers alphabetically
  const sortedProviders = Object.keys(groupedModels).sort();

  // Sort models within each provider group
  sortedProviders.forEach(provider => {
    groupedModels[provider].sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[220px] justify-between bg-background/70 border-border/40 hover:bg-background/90"
          disabled={validModels.length === 0}
          aria-label="Select AI model"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="model-dropdown"
        >
          <div className="flex items-center gap-2 truncate">
            <IconRobot className="h-4 w-4 text-primary/70" aria-hidden="true" />
            <span className="truncate">
              {selectedModel ? selectedModel.name : (validModels.length > 0 ? validModels[0].name : "Select a model")}
            </span>
          </div>
          <IconChevronDown className="ml-2 h-4 w-4 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-[220px]"
        id="model-dropdown"
        role="listbox"
        aria-label="Available AI models"
      >
        {validModels.length === 0 ? (
          <DropdownMenuItem 
            disabled
            role="option"
            aria-disabled="true"
          >
            No models available
          </DropdownMenuItem>
        ) : sortedProviders.length === 0 ? (
          // Display a message if somehow we have models but no providers
          <DropdownMenuItem
            disabled
            role="option"
            aria-disabled="true"
          >
            Models data format issue
          </DropdownMenuItem>
        ) : (
          sortedProviders.map((provider, index) => {
            // Generate a safe provider key
            const providerKey = `provider-${provider || index}`;
            
            return (
              <div key={providerKey}>
                {index > 0 && <DropdownMenuSeparator key={`sep-${providerKey}`} />}
                {groupedModels[provider].map((model, modelIndex) => {
                  // Ensure each model has a unique, stable key
                  const modelKey = model.id || model.modelId || `model-${provider}-${modelIndex}`;
                  
                  return (
                    <DropdownMenuItem
                      key={modelKey}
                      onClick={() => onModelSelect(model)}
                      className="flex items-center justify-between"
                      role="option"
                      aria-selected={model.id === selectedModel?.id}
                      id={`model-option-${modelKey}`}
                    >
                      <span className="truncate">{model.name || 'Unnamed Model'}</span>
                      {model.id === selectedModel?.id && (
                        <span 
                          className="ml-2 h-2 w-2 rounded-full bg-primary" 
                          aria-hidden="true"
                        />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 