"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[220px] justify-between bg-background/70 border-border/40 hover:bg-background/90"
          disabled={models.length === 0}
        >
          <div className="flex items-center gap-2 truncate">
            <IconRobot className="h-4 w-4 text-primary/70" />
            <span className="truncate">
              {selectedModel ? selectedModel.name : "Select a model"}
            </span>
          </div>
          <IconChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelSelect(model)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{model.name}</span>
            {model.id === selectedModel?.id && (
              <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
        {models.length === 0 && (
          <DropdownMenuItem disabled>
            No models available
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 