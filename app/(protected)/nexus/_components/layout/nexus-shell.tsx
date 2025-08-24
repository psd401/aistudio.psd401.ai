'use client'

import { ReactNode } from 'react'
import { NexusHeader } from './nexus-header'
import { NexusSidebar } from './nexus-sidebar'

interface NexusShellProps {
  children: ReactNode
}

export function NexusShell({ children }: NexusShellProps) {
  return (
    <div className="flex h-screen w-full">
      <NexusSidebar />
      <div className="flex flex-1 flex-col">
        <NexusHeader />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}