"use client"

import { memo } from "react"
import { CommandItem } from "@/components/ui/command"
import { Check, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ModelSelectorItemProps } from "./model-selector-types"

export const ModelSelectorItem = memo(function ModelSelectorItem({
  model,
  isSelected,
  onSelect,
  showDescription = true,
  isDisabled = false,
  disabledReason
}: ModelSelectorItemProps) {
  return (
    <CommandItem
      value={`${model.name} ${model.modelId} ${model.provider || ''} ${model.description || ''}`}
      onSelect={isDisabled ? undefined : onSelect}
      disabled={isDisabled}
      className={cn(
        "flex flex-col items-start py-2 px-3 cursor-pointer",
        isDisabled && "opacity-50 cursor-not-allowed"
      )}
      aria-selected={isSelected}
      aria-disabled={isDisabled}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium truncate",
              isSelected && "text-primary"
            )}>
              {model.name}
            </span>
            {isSelected && (
              <Check className="h-3 w-3 text-primary flex-shrink-0" aria-hidden="true" />
            )}
            {isDisabled && (
              <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            )}
          </div>
          
          {showDescription && model.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {model.description}
            </p>
          )}
          
          {isDisabled && disabledReason && (
            <p className="text-xs text-destructive mt-1">
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </CommandItem>
  )
})