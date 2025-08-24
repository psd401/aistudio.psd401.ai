'use client'

import { ReactNode } from 'react'

interface NexusLayoutProps {
  children: ReactNode
}

export default function NexusLayout({ children }: NexusLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}