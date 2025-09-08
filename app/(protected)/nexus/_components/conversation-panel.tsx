'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ConversationList } from '@/components/nexus/conversation-list'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { Button } from '@/components/ui/button'
import { PanelRightOpen, PanelRightClose } from 'lucide-react'

interface ConversationPanelProps {
  selectedConversationId?: string | null
}

export function ConversationPanel({ selectedConversationId }: ConversationPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const togglePanel = () => setIsOpen(!isOpen)

  if (isMobile) {
    return (
      <>
        {/* Toggle Button - Mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="fixed bottom-4 right-4 z-40 rounded-full shadow-lg bg-background border"
          aria-label={isOpen ? 'Close conversations panel' : 'Open conversations panel'}
        >
          {isOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>

        {/* Mobile Drawer */}
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>Conversations</DrawerTitle>
            </DrawerHeader>
            
            <div className="flex-1 overflow-y-auto px-4 pb-4 max-h-[calc(80vh-6rem)]">
              <ConversationList 
                selectedConversationId={selectedConversationId}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <>
      {/* Toggle Button - Desktop */}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePanel}
        className="fixed right-4 top-32 z-40"
        aria-label={isOpen ? 'Close conversations panel' : 'Open conversations panel'}
      >
        {isOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
      </Button>

      {/* Desktop Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent position="right" className="w-[400px]">
          <SheetHeader>
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto mt-4 max-h-[calc(100vh-8rem)]">
            <ConversationList 
              selectedConversationId={selectedConversationId}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}