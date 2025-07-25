"use client"

import { cn } from "@/lib/utils"
import { IconUser, IconRobot, IconThumbUp, IconThumbDown, IconCopy } from "@tabler/icons-react"
import type { Message as MessageType } from "ai"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

interface MessageProps {
  message: MessageType
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

export function Message({ message, messageId }: MessageProps) {
  const { toast } = useToast()
  const isAssistant = message.role === "assistant"
  const uniqueId = messageId || `message-${message.id}`
  

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
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
          <ReactMarkdown
            className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0"
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
            {message.content}
          </ReactMarkdown>
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