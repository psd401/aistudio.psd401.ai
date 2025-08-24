'use client'

import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Copy, ThumbsUp, ThumbsDown, RefreshCw, User, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { UIMessage } from 'ai'
import ReactMarkdown from 'react-markdown'

const messageVariants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1
  },
  exit: { 
    opacity: 0, 
    x: -20
  }
}

interface NexusMessageProps {
  message: UIMessage
}

export function NexusMessage({ message }: NexusMessageProps) {
  const [copied, setCopied] = useState(false)
  
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  
  // Get text content from message (AI SDK v5 uses parts array)
  let textContent = ''
  if (message.parts && Array.isArray(message.parts)) {
    const textParts = message.parts.filter((part: unknown) => 
      typeof part === 'object' && part !== null && 
      'type' in part && (part as { type: string }).type === 'text' && 
      'text' in part
    )
    textContent = textParts.map((part: unknown) => {
      const p = part as { text: string }
      return p.text
    }).join('')
  }
  
  const handleCopy = async () => {
    if (textContent) {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRegenerate = () => {
    if (isAssistant) {
      // For now, just return - regeneration will be implemented with conversation state management
      // This feature requires conversation history tracking
      return
    }
  }

  return (
    <motion.div
      variants={messageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`group flex w-full gap-4 px-4 py-6 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Assistant Avatar */}
      {isAssistant && (
        <div className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src="/nexus-avatar.png" alt="Nexus AI" />
            <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
              <Sparkles size={16} />
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* Message Content */}
      <div className={`flex max-w-[80%] flex-col gap-2 ${
        isUser ? 'items-end' : 'items-start'
      }`}>
        <motion.div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.1 }}
        >
          {isAssistant ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>
                {textContent}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{textContent}</p>
          )}
        </motion.div>

        {/* Message Actions */}
        {isAssistant && (
          <div
            className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCopy}
              className="h-7 px-2 text-xs"
            >
              <Copy size={12} />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRegenerate}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw size={12} />
              Regenerate
            </Button>
            
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <ThumbsUp size={12} />
            </Button>
            
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <ThumbsDown size={12} />
            </Button>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              <User size={16} />
            </AvatarFallback>
          </Avatar>
        </div>
      )}
    </motion.div>
  )
}