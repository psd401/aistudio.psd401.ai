'use client'

import { 
  ThreadPrimitive,
  useThread
} from '@assistant-ui/react'
import { motion } from 'framer-motion'
import { NexusComposer } from './nexus-composer'
import { NexusMessage } from './nexus-message'
import { NexusThinkingIndicator } from './nexus-thinking-indicator'
import { Sparkles } from 'lucide-react'

interface NexusThreadProps {
  className?: string
}

export function NexusThread({ className }: NexusThreadProps) {
  const thread = useThread()
  const hasMessages = thread.messages.length > 0

  return (
    <div className={`flex h-full flex-col ${className || ''}`}>
      <ThreadPrimitive.Root className="flex h-full flex-col">
        {/* Welcome Message */}
        {!hasMessages && (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600"
            >
              <Sparkles className="h-8 w-8 text-white" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h1 className="mb-3 text-2xl font-bold text-foreground">
                Welcome to Nexus
              </h1>
              <p className="mb-6 text-muted-foreground max-w-md">
                Your premium AI chat experience with advanced features, 
                real-time streaming, and intelligent conversations.
              </p>
            </motion.div>
          </div>
        )}

        {/* Messages Area */}
        {hasMessages && (
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto px-4 py-2">
              <ThreadPrimitive.Messages 
                components={{
                  UserMessage: NexusMessage,
                  AssistantMessage: NexusMessage,
                }}
              />
            </div>
            <NexusThinkingIndicator />
          </div>
        )}

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-border bg-background p-4">
          <NexusComposer />
        </div>
      </ThreadPrimitive.Root>
    </div>
  )
}