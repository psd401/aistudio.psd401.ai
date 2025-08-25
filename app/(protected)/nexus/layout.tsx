'use client'

import { ReactNode } from 'react'
import { NavbarNested } from '@/components/navigation/navbar-nested'

interface NexusLayoutProps {
  children: ReactNode
}

export default function NexusLayout({ children }: NexusLayoutProps) {
  return (
    <div className="flex min-h-screen pt-14 bg-white">
      <NavbarNested />
      <main className="flex-1 lg:pl-[68px]">
        <div className="bg-white h-full">
          {children}
        </div>
      </main>
    </div>
  )
}