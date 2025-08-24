'use client'

import { 
  ComposerPrimitive,
  useThread
} from '@assistant-ui/react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Square } from 'lucide-react'
import { useRef, useEffect, FormEvent, useState, useCallback } from 'react'

export function NexusComposer() {
  const thread = useThread()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [localValue, setLocalValue] = useState('')
  
  const isRunning = thread.isRunning
  const isEmpty = localValue.trim().length === 0
  
  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }, [localValue])

  const handleSubmit = useCallback((e?: FormEvent) => {
    if (e) {
      e.preventDefault()
    }
    
    if (!isEmpty && !isRunning && formRef.current) {
      // Trigger the ComposerPrimitive.Send button click
      const sendButton = formRef.current.querySelector('button[type="submit"]') as HTMLButtonElement
      if (sendButton) {
        sendButton.click()
        setLocalValue('') // Clear after sending
      }
    }
  }, [isEmpty, isRunning])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send with Cmd+Enter or Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    // Add new line with Shift+Enter
    else if (e.shiftKey && e.key === 'Enter') {
      // Allow default behavior (new line)
    }
    // Send with Enter (if not shift)
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleStop = () => {
    // Stop functionality would be implemented when thread.stop is available
    // For now, this is a placeholder
  }

  return (
    <ComposerPrimitive.Root className="flex w-full">
      <form 
        ref={formRef}
        className="flex w-full"
        onSubmit={handleSubmit}
      >
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

          {/* Text Input */}
          <div className="flex-1">
            <ComposerPrimitive.Input asChild>
              <Textarea
                ref={textareaRef}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isRunning 
                    ? "AI is responding..." 
                    : "Type your message... (⌘+Enter to send)"
                }
                disabled={isRunning}
                className="min-h-[20px] resize-none border-0 bg-transparent p-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0"
                rows={1}
              />
            </ComposerPrimitive.Input>
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
                  type="submit"
                  size="sm"
                  disabled={isEmpty}
                  className="h-8 w-8 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send size={12} />
                </Button>
              </ComposerPrimitive.Send>
            </motion.div>
          )}
        </div>
      </form>
    </ComposerPrimitive.Root>
  )
}