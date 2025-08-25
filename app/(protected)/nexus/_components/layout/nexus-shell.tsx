'use client'

import { ReactNode } from 'react'
import { NexusHeader } from './nexus-header'
import type { SelectAiModel } from '@/types'

interface NexusShellProps {
  children: ReactNode
  selectedModel: SelectAiModel | null
  onModelChange: (model: SelectAiModel) => void
  models: SelectAiModel[]
  isLoadingModels: boolean
  enabledTools: string[]
  onToolsChange: (tools: string[]) => void
}

export function NexusShell({ 
  children, 
  selectedModel, 
  onModelChange, 
  models, 
  isLoadingModels,
  enabledTools,
  onToolsChange
}: NexusShellProps) {
  return (
    <div className="flex h-full w-full flex-col" data-testid="nexus-shell">
      <NexusHeader 
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        models={models}
        isLoadingModels={isLoadingModels}
        enabledTools={enabledTools}
        onToolsChange={onToolsChange}
      />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}