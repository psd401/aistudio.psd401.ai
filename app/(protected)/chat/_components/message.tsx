"use client"

import { cn } from "@/lib/utils"
import { 
  IconUser, 
  IconThumbUp, 
  IconThumbDown, 
  IconCopy, 
  IconBrain, 
  IconChevronDown, 
  IconChevronUp,
  IconSparkles
} from "@tabler/icons-react"
import { useState } from "react"
import type { UIMessage as MessageType } from "@ai-sdk/react"
import type { SelectMessage } from "@/types/schema-types"

// Define proper types for message parts
type TextPart = { type: 'text'; text: string };
type MessagePart = TextPart | { type: string; [key: string]: unknown };
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"

interface MessageProps {
  message: MessageType | SelectMessage
  messageId?: string
  isStreaming?: boolean
}

// Type guard to check if message has model information
function hasModelInfo(message: MessageType | SelectMessage): message is SelectMessage {
  return 'modelName' in message && message.modelName !== undefined
}

// Simple avatar component with animations
function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <motion.div 
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={cn(
        "flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl shadow-lg",
        role === "assistant" 
          ? "bg-gradient-to-br from-primary/80 to-accent/80 text-white" 
          : "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
      )}
      role="img"
      aria-label={role === "user" ? "User avatar" : "Assistant avatar"}
    >
      {role === "user" ? (
        <IconUser className="h-6 w-6" aria-hidden="true" />
      ) : (
        <IconSparkles className="h-6 w-6" aria-hidden="true" />
      )}
    </motion.div>
  )
}

export function Message({ message, messageId, isStreaming = false }: MessageProps) {
  const { toast } = useToast()
  const [showReasoning, setShowReasoning] = useState(false)
  const isAssistant = message.role === "assistant"
  const uniqueId = messageId || `message-${message.id}`
  
  // Get content - handle AI SDK v2 format (parts array) and legacy formats
  let content = ''
  
  // AI SDK v2 format with parts array
  if ('parts' in message && Array.isArray(message.parts)) {
    const parts = message.parts as MessagePart[];
    content = parts
      .filter((part): part is TextPart => part.type === 'text')
      .map(part => part.text)
      .join('')
  }
  // Legacy format with content string
  else if ('content' in message) {
    const msg = message as SelectMessage;
    if (msg.content) {
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const contentArray = msg.content as Array<string | { text?: string }>;
        content = contentArray.map(c => 
          typeof c === 'string' ? c : c.text || ''
        ).join('');
      }
    }
  }
  
  // Check for reasoning content and parse if needed
  const reasoningContent = 'reasoningContent' in message ? 
    (() => {
      const raw = message.reasoningContent;
      if (!raw) return null;
      try {
        // If it's a string that looks like JSON, parse and re-stringify for formatting
        if (typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) {
          return JSON.stringify(JSON.parse(raw), null, 2);
        }
        return raw;
      } catch {
        return raw;
      }
    })() : null;
  const hasReasoningData = !!reasoningContent
  
  // Get model display name
  const modelDisplayName = hasModelInfo(message) && message.modelName
    ? `${message.modelName}${message.modelProvider ? ` (${message.modelProvider})` : ''}`
    : null

  const handleCopy = () => {
    const contentToCopy = hasReasoningData && showReasoning && reasoningContent
      ? `Reasoning:\n${reasoningContent}\n\nResponse:\n${content}`
      : content
    
    navigator.clipboard.writeText(contentToCopy)
      .then(() => toast({ title: "Copied to clipboard" }))
      .catch(() => toast({ title: "Failed to copy", variant: "destructive" }))
  }

  const handleFeedback = (feedback: "like" | "dislike") => {
    toast({ title: `Feedback: ${feedback} (coming soon)` })
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: isAssistant ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("group flex w-full items-start gap-4 relative", {
        "justify-end": !isAssistant,
      })}
      aria-labelledby={`${uniqueId}-author`}
      role="listitem"
    >
      {/* Avatar */}
      {isAssistant && <Avatar role="assistant" />}

      {/* Message Bubble & Content */}
      <motion.div 
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "flex flex-col w-fit rounded-2xl shadow-lg backdrop-blur-sm", 
          isAssistant
            ? "bg-gradient-to-br from-card/90 to-card/70 border border-border/30 max-w-[85%]"
            : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground max-w-[75%]"
        )}
        aria-live={isAssistant ? "polite" : "off"}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span 
              id={`${uniqueId}-author`} 
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                isAssistant ? "text-muted-foreground" : "text-primary-foreground/80"
              )}
            >
              {isAssistant ? "Assistant" : "You"}
            </span>
            {isAssistant && modelDisplayName && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5"
              >
                <IconBrain className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {modelDisplayName}
                </span>
              </motion.div>
            )}
          </div>
          
          {/* Reasoning Section */}
          {isAssistant && hasReasoningData && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-3 border-l-2 border-primary/30 pl-3"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReasoning(!showReasoning)}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showReasoning ? (
                  <>
                    <IconChevronUp className="h-3 w-3 mr-1" />
                    Hide reasoning
                  </>
                ) : (
                  <>
                    <IconChevronDown className="h-3 w-3 mr-1" />
                    Show reasoning
                  </>
                )}
              </Button>
              {showReasoning && reasoningContent && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-muted-foreground italic bg-muted/30 rounded-lg p-3"
                >
                  <ReactMarkdown>
                    {reasoningContent}
                  </ReactMarkdown>
                </motion.div>
              )}
            </motion.div>
          )}
          
          {/* Main Content */}
          <div className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            !isAssistant && "prose-invert"
          )}>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mb-1 mt-2">{children}</h3>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-primary/30 pl-4 italic my-2">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
                  const match = /language-(\w+)/.exec(className || "")
                  const language = match ? match[1] : ""
                  const inline = !language
    
                  if (inline) {
                    return (
                      <code
                        className={cn(
                          "rounded-md px-1.5 py-0.5 font-mono text-sm",
                          isAssistant 
                            ? "bg-muted text-foreground" 
                            : "bg-primary-foreground/10 text-primary-foreground"
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  }
    
                  return (
                    <div className="relative mb-4 mt-2 last:mb-0 rounded-lg overflow-hidden">
                      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                        <span 
                          className="text-xs text-muted-foreground/80 bg-background/50 px-2 py-1 rounded"
                          aria-label={`Code language: ${language}`}
                        >
                          {language}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 hover:bg-background/50"
                          onClick={() => {
                            navigator.clipboard.writeText(String(children).replace(/\n$/, ""))
                            toast({ title: "Code copied!" })
                          }}
                        >
                          <IconCopy className="h-3 w-3" />
                        </Button>
                      </div>
                      <SyntaxHighlighter
                        language={language}
                        // @ts-expect-error - react-syntax-highlighter types are incorrect
                        style={vscDarkPlus}
                        PreTag="div"
                        className="!my-0 !font-mono !text-sm"
                        showLineNumbers={true}
                        customStyle={{
                          margin: 0,
                          background: "hsl(var(--muted))",
                          padding: "1rem",
                          paddingTop: "2.5rem"
                        }}
                        aria-label={`Code snippet in ${language || "unknown"} language`}
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    </div>
                  )
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Action Buttons (Show on Hover, ONLY for Assistant) */}
        {isAssistant && (
          <motion.div 
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="flex items-center justify-end gap-1 px-3 pb-2 text-muted-foreground"
            aria-label="Message actions"
          >
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 hover:bg-muted/50 hover:text-green-600 transition-all" 
              onClick={() => handleFeedback('like')} 
              aria-label="Like response"
            >
              <IconThumbUp className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 hover:bg-muted/50 hover:text-red-600 transition-all" 
              onClick={() => handleFeedback('dislike')} 
              aria-label="Dislike response"
            >
              <IconThumbDown className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 hover:bg-muted/50 hover:text-blue-600 transition-all" 
              onClick={handleCopy} 
              aria-label="Copy message"
            >
              <IconCopy className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </motion.div>
      
      {/* Avatar for User */}
      {!isAssistant && <Avatar role="user" />}
    </motion.div>
  )
}