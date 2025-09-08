'use client'

import Image from 'next/image'
import { ModelSelector } from '@/components/features/model-selector'
import { CompactToolSelector } from '../tools/compact-tool-selector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { SelectAiModel } from '@/types'

interface NexusHeaderProps {
  selectedModel: SelectAiModel | null
  onModelChange: (model: SelectAiModel) => void
  models: SelectAiModel[]
  isLoadingModels: boolean
  enabledTools: string[]
  onToolsChange: (tools: string[]) => void
}

export function NexusHeader({ 
  selectedModel, 
  onModelChange, 
  models, 
  isLoadingModels,
  enabledTools,
  onToolsChange
}: NexusHeaderProps) {
  return (
    <header className="border-b border-border bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/assistant_logos/image16.png"
            alt="Nexus"
            width={40}
            height={40}
            className="rounded-md"
          />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Nexus
            </h1>
            <p className="text-sm text-muted-foreground font-light">
              Your central hub for exploring the power of AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* New Chat Button - Full page reload to reset conversation */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/nexus'}
            className="flex items-center gap-1.5"
            title="Start new chat"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <CompactToolSelector
            selectedModel={selectedModel}
            enabledTools={enabledTools}
            onToolsChange={onToolsChange}
          />
          <ModelSelector
            models={models}
            value={selectedModel}
            onChange={onModelChange}
            requiredCapabilities={["chat"]}
            placeholder="Select AI model"
            loading={isLoadingModels}
            showDescription={true}
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