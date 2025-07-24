"use client"

import { useState, useRef, useEffect, memo } from "react"
import { useChat } from 'ai/react'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { ChatInput } from "@/components/ui/chat-input"
import { Message } from "@/components/ui/message"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"
import { IconPlayerStop } from "@tabler/icons-react"
import { Loader2, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SelectMessage } from "@/types/schema-types"
import type { SelectPromptResult } from "@/types/db-types"

interface PromptResult {
  promptId: number
  input: Record<string, unknown>
  output: string
  status: string
}

interface ExecutionContext {
  executionId: number
  toolId: number
  inputData: Record<string, unknown>
  promptResults: PromptResult[]
}

// Type guard for safe type checking
function isSelectPromptResult(result: any): result is SelectPromptResult {
  return result && typeof result.id !== 'undefined'
}

interface AssistantArchitectChatProps {
  execution: ExecutionResultDetails
  conversationId: number | null
  onConversationCreated?: (id: number) => void
  isPreview?: boolean
  modelId?: number | null
}

export const AssistantArchitectChat = memo(function AssistantArchitectChat({ 
  execution, 
  conversationId, 
  onConversationCreated,
  isPreview = false,
  modelId 
}: AssistantArchitectChatProps) {
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(conversationId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  
  // Use the passed modelId or default to 3 (first model in most systems)
  const actualModelId = modelId || 3


  // Use Vercel AI SDK's useChat hook with safe defaults
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit: handleChatSubmit, 
    isLoading, 
    stop,
    setMessages 
  } = useChat({
    api: '/api/chat/stream-final',
    body: {
      modelId: actualModelId, // Use the actual model from the execution
      conversationId: currentConversationId,
      source: "assistant_execution",
      executionId: isPreview ? null : execution?.id || null,
      context: currentConversationId === null && execution?.promptResults?.length > 0 ? {
        executionId: execution.id || 0,
        toolId: execution.assistantArchitectId || 0,
        inputData: execution.inputData || {},
        promptResults: (execution.promptResults || []).map(result => {
          // Use safe type checking with type guard
          if (isSelectPromptResult(result)) {
            // Safely access extended fields that may exist
            const extendedResult = {
              ...result,
              inputData: (result as any).inputData,
              outputData: (result as any).outputData || (result as any).result,
              status: (result as any).status
            }
            
            return {
              promptId: extendedResult.chainPromptId || extendedResult.id || 0,
              input: extendedResult.inputData || {},
              output: extendedResult.outputData || '',
              status: extendedResult.status || 'completed'
            }
          }
          
          // Fallback for results that don't match the type guard
          return {
            promptId: (result as any)?.promptId || (result as any)?.id || 0,
            input: (result as any)?.inputData || {},
            output: (result as any)?.outputData || (result as any)?.result || '',
            status: (result as any)?.status || 'completed'
          }
        })
      } as ExecutionContext : null
    },
    initialMessages: [],
    onResponse: (response) => {
      try {
        // Get conversation ID from header if this is a new conversation
        const conversationIdHeader = response.headers.get('X-Conversation-Id')
        if (!currentConversationId && conversationIdHeader) {
          const newConvId = parseInt(conversationIdHeader, 10)
          if (Number.isInteger(newConvId) && newConvId > 0) {
            setCurrentConversationId(newConvId)
            onConversationCreated?.(newConvId)
          }
        }
      } catch (error) {
        console.error("Error processing response", error)
        // Don't throw - just log the error
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })
    },
    onFinish: () => {
      // Scroll to bottom when message is complete
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        })
      }
    }
  })

  // Update internal conversation ID when prop changes
  useEffect(() => {
    setCurrentConversationId(conversationId)
  }, [conversationId])

  // Fetch conversation history when conversationId changes
  useEffect(() => {
    if (!currentConversationId) return;
    const fetchConversationHistory = async () => {
      try {
        const response = await fetch(`/api/chat?conversationId=${currentConversationId}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.messages)) {
            setMessages(data.messages.map((msg: SelectMessage) => ({
              id: msg.id.toString(),
              role: msg.role,
              content: msg.content
            })));
          }
        } else {
          console.error("Failed to fetch conversation history");
        }
      } catch (error) {
        console.error("Error fetching conversation history", error);
      }
    };
    fetchConversationHistory();
  }, [currentConversationId, setMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !actualModelId) return
    
    handleChatSubmit(e)
  }

  const MessageList = memo(function MessageList({ messages, isLoading }: { messages: Array<{ id: string; content: string; role: "user" | "assistant" | "system" | "function" | "data" | "tool" }>, isLoading: boolean }) {
    return (
      <div className="space-y-4">
        {messages.map((message) => (
          <Message key={message.id} message={{ 
            id: message.id, 
            role: message.role === "user" ? "user" : "assistant", 
            content: message.content 
          }} />
        ))}
        {isLoading && (
          <div className="flex items-start space-x-2 text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="flex items-center space-x-1 bg-muted rounded-lg px-3 py-2">
              <span className="text-sm">Thinking</span>
              <span className="flex space-x-1">
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          </div>
        )}
        {messages.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center">
            What else would you like to know?
          </p>
        )}
      </div>
    );
  });

  return (
    <div className="flex flex-col h-[400px] border rounded-lg overflow-hidden">
      <div className="p-3 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Follow-up</h3>
          {(currentConversationId || (execution?.promptResults?.length > 0)) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-help">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Context available</span>
                    <Info className="w-3 h-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs">
                    <div>The AI assistant has access to:</div>
                    <ul className="mt-1 ml-4 list-disc">
                      <li>Your original inputs</li>
                      <li>{execution?.promptResults?.length || 0} prompt execution results</li>
                      <li>Complete conversation history</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <MessageList messages={messages} isLoading={isLoading} />
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex items-end gap-2">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!actualModelId || (execution?.status !== 'completed' && !conversationId)}
            placeholder={
              (execution?.status !== 'completed' && !conversationId) ? "Waiting for execution to complete..." :
              !actualModelId ? "Model unavailable" :
              "Follow-up..."
            }
          />
          {isLoading && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => stop()}
              aria-label="Stop generation"
            >
              <IconPlayerStop className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}); 