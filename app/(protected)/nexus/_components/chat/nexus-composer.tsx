'use client'

import { 
  ComposerPrimitive,
  useThread
} from '@assistant-ui/react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Send, Paperclip, Square } from 'lucide-react'

export function NexusComposer() {
  const thread = useThread()
  const isRunning = thread.isRunning

  const handleStop = () => {
    // Stop functionality - placeholder for now
    // Will be implemented when thread.stop is available
  }

  return (
    <ComposerPrimitive.Root className="flex w-full">
      <div className="flex w-full items-end gap-3 rounded-2xl border border-border bg-background p-3 shadow-sm transition-all focus-within:border-primary focus-within:shadow-md">
        {/* Attachment Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 flex-shrink-0 rounded-full"
          disabled={isRunning}
        >
          <Paperclip size={16} />
        </Button>

        {/* Text Input - Let ComposerPrimitive.Input manage its own state */}
        <div className="flex-1">
          <ComposerPrimitive.Input 
            autoFocus
            placeholder={
              isRunning 
                ? "AI is responding..." 
                : "Type your message... (⌘+Enter to send)"
            }
            disabled={isRunning}
            className="min-h-[20px] w-full resize-none border-0 bg-transparent p-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0"
          />
        </div>

        {/* Send/Cancel Button */}
        {isRunning ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleStop}
              className="h-8 w-8 flex-shrink-0 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Square size={12} />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <ComposerPrimitive.Send asChild>
              <Button
                size="sm"
                className="h-8 w-8 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send size={12} />
              </Button>
            </ComposerPrimitive.Send>
          </motion.div>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}