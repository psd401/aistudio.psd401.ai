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
}

export function NexusShell({ 
  children, 
  selectedModel, 
  onModelChange, 
  models, 
  isLoadingModels 
}: NexusShellProps) {
  return (
    <div className="flex h-full w-full flex-col">
      <NexusHeader 
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        models={models}
        isLoadingModels={isLoadingModels}
      />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}