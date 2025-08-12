"use client"

import { cn } from "@/lib/utils"
import { IconUser, IconRobot, IconThumbUp, IconThumbDown, IconCopy, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { 
  extractTextFromParts, 
  extractReasoningFromParts, 
  hasReasoning,
  convertLegacyMessage,
  ToolCallPart,
  FilePart,
  ImagePart
} from "@/types/ai-sdk-v5-types"
import Image from "next/image"

interface MessageProps {
  message: unknown // Accept any message format - will be converted by convertLegacyMessage
  /** Unique ID for the message for accessibility purposes */
  messageId?: string
}

// Simple avatar component (can be expanded later)
function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <div 
      className={cn(
        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full",
        role === "assistant" 
          ? "bg-primary/10 text-primary" 
          : "bg-blue-500/20 text-blue-700" // Example user avatar style
      )}
      role="img"
      aria-label={role === "user" ? "User avatar" : "Assistant avatar"}
    >
      {role === "user" ? (
        <IconUser className="h-5 w-5" aria-hidden="true" />
      ) : (
        <IconRobot className="h-5 w-5" aria-hidden="true" />
      )}
    </div>
  )
}

export function Message({ message: rawMessage, messageId }: MessageProps) {
  const { toast } = useToast()
  const [showReasoning, setShowReasoning] = useState(false)
  
  // Convert message to v5 format if needed
  const message = convertLegacyMessage(rawMessage)
  const isAssistant = message.role === "assistant"
  const uniqueId = messageId || `message-${message.id}`
  
  // Extract content from parts
  const textContent = extractTextFromParts(message.parts)
  const reasoningContent = extractReasoningFromParts(message.parts)
  const hasReasoningContent = hasReasoning(message)

  const handleCopy = () => {
    const contentToCopy = hasReasoningContent && showReasoning 
      ? `Reasoning:\n${reasoningContent}\n\nResponse:\n${textContent}`
      : textContent
    
    navigator.clipboard.writeText(contentToCopy)
      .then(() => toast({ title: "Copied to clipboard" }))
      .catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
  };

  const handleFeedback = (feedback: "like" | "dislike") => {
    // TODO: Implement feedback submission
    toast({ title: `Feedback: ${feedback} (not implemented)` });
  };

  return (
    <div 
      className={cn("group flex w-full items-start gap-3 relative mb-4", {
        "justify-end": !isAssistant,
      })}
      aria-labelledby={`${uniqueId}-author`}
      role="listitem"
    >
      {/* Avatar */}
      {isAssistant && <Avatar role="assistant" />}

      {/* Message Bubble & Content */}
      <div 
        className={cn(
          "flex flex-col w-fit rounded-lg shadow-sm", 
          isAssistant
            ? "bg-card border border-border/50 max-w-[85%]"
            : "bg-primary text-primary-foreground max-w-[75%]"
        )}
        aria-live={isAssistant ? "polite" : "off"}
      >
        <div className="px-3 py-2">
          <span 
            id={`${uniqueId}-author`} 
            className="text-xs font-semibold mb-1 block"
          >
            {isAssistant ? "Assistant" : "You"}
          </span>
          
          {/* Reasoning Section (for assistant messages with reasoning) */}
          {isAssistant && hasReasoningContent && (
            <div className="mb-3 border-l-2 border-muted pl-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReasoning(!showReasoning)}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
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
              {showReasoning && (
                <div className="mt-2 text-sm text-muted-foreground italic">
                  <ReactMarkdown>{reasoningContent}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
          
          {/* Main content */}
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
            <ReactMarkdown
              components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              // Use default pre/code handling from prose for consistency?
              // Or keep custom highlighter if preferred.
              code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
                const match = /language-(\w+)/.exec(className || "")
                const language = match ? match[1] : ""
                const inline = !language
  
                if (inline) {
                  return (
                    <code
                      className="rounded bg-black/10 px-1 py-0.5 font-mono text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  )
                }
  
                return (
                  <div className="relative mb-4 mt-2 last:mb-0">
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                      <span 
                        className="text-xs text-muted-foreground/80"
                        aria-label={`Code language: ${language}`}
                      >
                        {language}
                      </span>
                    </div>
                    <SyntaxHighlighter
                      language={language}
                      // @ts-expect-error - react-syntax-highlighter types are incorrect
                      style={vscDarkPlus}
                      PreTag="div"
                      className="!my-0 !bg-code-block !p-4 !font-mono !text-sm rounded-md overflow-x-auto"
                      showLineNumbers={false} // Optional: disable line numbers
                      customStyle={{
                        margin: 0,
                        background: "hsl(var(--code-block-bg))", // Use CSS var for theme consistency
                        padding: "1rem",
                        borderRadius: "0.375rem"
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
            {textContent || (message.parts.length === 0 ? "..." : "")}
            </ReactMarkdown>
          </div>
          
          {/* Tool calls, files, and other part types rendering */}
          {message.parts
            .filter((part): part is ToolCallPart => part.type === 'tool-call')
            .map((part, idx) => (
              <div key={idx} className="mt-2 p-2 bg-muted/50 rounded text-xs">
                🔧 Calling {part.toolName}...
              </div>
            ))}
          
          {message.parts
            .filter((part): part is (FilePart | ImagePart) => part.type === 'file' || part.type === 'image')
            .map((part, idx) => (
              <div key={idx} className="mt-2">
                {part.type === 'image' ? (
                  <Image 
                    src={(() => {
                      const img = (part as ImagePart).image;
                      // Only use string URLs for Next.js Image component
                      if (typeof img === 'string') return img;
                      // For other types, show a placeholder
                      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjI1MCIgeT0iMTUwIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjIwIj5JbWFnZTwvdGV4dD48L3N2Zz4=';
                    })()} 
                    alt="Uploaded image" 
                    width={500}
                    height={300}
                    className="max-w-full rounded"
                    style={{ width: 'auto', height: 'auto' }}
                  />
                ) : (
                  <div className="p-2 bg-muted/50 rounded text-sm">
                    📎 {(part as FilePart).filename || 'File attachment'}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Action Buttons (Show on Hover, ONLY for Assistant) */}
        {isAssistant && (
          <div 
            className={cn(
              "flex items-center justify-end gap-1 px-2 pt-0 pb-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
            )}
            aria-label="Message actions"
          >
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 hover:bg-muted/50" 
              onClick={() => handleFeedback('like')} 
              aria-label="Like response"
              aria-describedby={`${uniqueId}-content`}
            >
              <IconThumbUp className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Like this response</span>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 hover:bg-muted/50" 
              onClick={() => handleFeedback('dislike')} 
              aria-label="Dislike response"
              aria-describedby={`${uniqueId}-content`}
            >
              <IconThumbDown className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Dislike this response</span>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 hover:bg-muted/50" 
              onClick={handleCopy} 
              aria-label="Copy message"
              aria-describedby={`${uniqueId}-content`}
            >
              <IconCopy className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Copy this message</span>
            </Button>
            {/* Regenerate button placeholder */}
          </div>
        )}
      </div>
      
      {/* Avatar for User */}
      {!isAssistant && <Avatar role="user" />}
    </div>
  )
} 