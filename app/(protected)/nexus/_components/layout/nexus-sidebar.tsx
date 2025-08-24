'use client'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquarePlus } from 'lucide-react'

export function NexusSidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-background">
      <div className="p-4">
        <Button variant="default" className="w-full justify-start gap-2">
          <MessageSquarePlus size={16} />
          New Conversation
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Conversation history will go here */}
          <div className="text-sm text-muted-foreground p-4 text-center">
            No conversations yet
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}