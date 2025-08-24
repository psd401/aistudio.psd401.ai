'use client'

import { ReactNode } from 'react'
import { NexusHeader } from './nexus-header'
import { NexusSidebar } from './nexus-sidebar'
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
    <div className="flex h-screen w-full pt-14">
      <NexusSidebar />
      <div className="flex flex-1 flex-col">
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
    </div>
  )
}