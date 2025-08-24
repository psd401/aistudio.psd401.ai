'use client'

import { ModelSelector } from '@/components/features/model-selector'
import type { SelectAiModel } from '@/types'

interface NexusHeaderProps {
  selectedModel: SelectAiModel | null
  onModelChange: (model: SelectAiModel) => void
  models: SelectAiModel[]
  isLoadingModels: boolean
}

export function NexusHeader({ selectedModel, onModelChange, models, isLoadingModels }: NexusHeaderProps) {
  return (
    <header className="border-b border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            Nexus
          </h1>
          <div className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            Preview
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector
            models={models}
            value={selectedModel}
            onChange={onModelChange}
            requiredCapabilities={["chat"]}
            placeholder="Select AI model"
            loading={isLoadingModels}
            showDescription={false}
            groupByProvider={true}
            hideRoleRestricted={true}
            hideCapabilityMissing={true}
            className="w-[250px]"
          />
        </div>
      </div>
    </header>
  )
}