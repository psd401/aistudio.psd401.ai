"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

interface AiThinkingIndicatorProps {
  processingDocument?: boolean
  modelName?: string
}

export function AiThinkingIndicator({ processingDocument, modelName }: AiThinkingIndicatorProps) {
  const [dots, setDots] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState(0)
  
  const messages = processingDocument ? [
    "Reading document",
    "Analyzing content",
    "Preparing response"
  ] : [
    "Thinking",
    "Processing your request",
    "Generating response"
  ]
  
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4)
    }, 500)
    
    const messageInterval = setInterval(() => {
      setLoadingMessage((prev) => (prev + 1) % messages.length)
    }, 2000)
    
    return () => {
      clearInterval(dotsInterval)
      clearInterval(messageInterval)
    }
  }, [messages.length])
  
  return (
    <div className="flex items-start gap-3 p-4 mt-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {modelName || "AI"} is {messages[loadingMessage].toLowerCase()}{'.'.repeat(dots)}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1">
            <div 
              className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" 
              style={{ animationDelay: '0ms' }}
            />
            <div 
              className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" 
              style={{ animationDelay: '200ms' }}
            />
            <div 
              className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" 
              style={{ animationDelay: '400ms' }}
            />
          </div>
          {processingDocument && (
            <span className="text-xs text-muted-foreground">
              Using document context
            </span>
          )}
        </div>
      </div>
    </div>
  )
}