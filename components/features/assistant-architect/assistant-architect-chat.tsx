"use client"

import { useState, useRef, useEffect, memo, useMemo } from "react"
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

// Extended prompt result type that includes additional fields from the execution
interface ExtendedPromptResult {
  id: number;
  toolExecutionId: number;
  chainPromptId: number;
  result: string;
  aiModelId: number | null;
  createdAt: Date;
  updatedAt: Date;
  inputData?: Record<string, unknown>;
  outputData?: string;
  status?: string;
  userFeedback?: 'like' | 'dislike';
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
  
  // Track if we're currently streaming to prevent re-initialization
  const [isStreaming, setIsStreaming] = useState(false)
  // Track when we just finished streaming to prevent history fetch race condition
  const [justFinishedStreaming, setJustFinishedStreaming] = useState(false)


  // Create a stable context that doesn't change
  const executionContext = useMemo(() => {
    if (currentConversationId !== null || !execution?.promptResults?.length) {
      return null;
    }
    
    // SAFEGUARD: Validate execution ID
    const execId = execution.id;
    if (!execId || (typeof execId === 'string' && execId === 'streaming')) {
      console.error('[assistant-chat] Invalid execution ID in context:', execId);
      return null;
    }
    
    // SAFEGUARD: Ensure numeric execution ID
    const numericExecId = typeof execId === 'number' ? execId : parseInt(String(execId), 10);
    if (isNaN(numericExecId) || numericExecId <= 0) {
      console.error('[assistant-chat] Non-numeric or invalid execution ID:', execId);
      return null;
    }
    
    return {
      executionId: numericExecId,
      toolId: execution.assistantArchitectId || 0,
      inputData: execution.inputData || {},
      promptResults: (execution.promptResults || []).map(result => {
        const extendedResult = result as ExtendedPromptResult;
        return {
          promptId: extendedResult.chainPromptId || extendedResult.id || 0,
          input: extendedResult.inputData || {},
          output: extendedResult.outputData || extendedResult.result || '',
          status: extendedResult.status || 'completed'
        }
      })
    } as ExecutionContext;
  }, [execution]);

  // Store the conversation ID in a ref so it doesn't cause re-initialization
  const conversationIdRef = useRef<number | null>(currentConversationId);
  
  // Update the ref when conversation ID changes
  useEffect(() => {
    conversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Create stable body without conversation ID to prevent re-initialization
  const stableBody = useMemo(() => {
    // SAFEGUARD: Validate and sanitize execution ID
    let validExecutionId = null;
    if (!isPreview && execution?.id) {
      const execId = execution.id;
      // SAFEGUARD: Reject 'streaming' or other invalid string values
      if (typeof execId === 'string' && (execId === 'streaming' || execId === 'undefined')) {
        console.error('[assistant-chat] Invalid execution ID for API call:', execId);
      } else {
        // Ensure numeric ID
        const numId = typeof execId === 'number' ? execId : parseInt(String(execId), 10);
        if (!isNaN(numId) && numId > 0) {
          validExecutionId = numId;
        } else {
          console.error('[assistant-chat] Failed to parse valid execution ID:', execId);
        }
      }
    }
    
    return {
      modelId: actualModelId,
      source: "assistant_execution",
      executionId: validExecutionId,
      context: executionContext
    };
  }, [actualModelId, isPreview, execution?.id, executionContext, currentConversationId]);

  // Use Vercel AI SDK's useChat hook
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
    body: stableBody,
    initialMessages: [],
    onResponse: (response) => {
      setIsStreaming(true);
      try {
        // Get conversation ID from header if this is a new conversation
        const conversationIdHeader = response.headers.get('X-Conversation-Id')
        if (!currentConversationId && conversationIdHeader) {
          const newConvId = parseInt(conversationIdHeader, 10)
          if (Number.isInteger(newConvId) && newConvId > 0) {
            setIsNewConversation(true);
            conversationIdRef.current = newConvId;
            setCurrentConversationId(newConvId)
            onConversationCreated?.(newConvId)
          }
        }
      } catch (error) {
        console.error("Error processing response headers", error)
      }
    },
    onError: (error) => {
      setIsStreaming(false);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })
    },
    onFinish: () => {
      setIsStreaming(false);
      setJustFinishedStreaming(true);
      // Clear the flag after a short delay
      setTimeout(() => setJustFinishedStreaming(false), 1000);
      // Scroll to bottom when message is complete
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        })
      }
    },
    // Override fetch to inject conversation ID dynamically
    fetch: async (url, options) => {
      try {
        const body = JSON.parse(options?.body as string || '{}');
        body.conversationId = conversationIdRef.current;
        
        // SAFEGUARD: Final validation of executionId before sending
        if (body.executionId !== null && body.executionId !== undefined) {
          const execId = body.executionId;
          if (typeof execId === 'string' && (execId === 'streaming' || execId === 'undefined')) {
            console.error('[assistant-chat] Blocking invalid executionId in request:', execId);
            body.executionId = null;
          } else if (typeof execId === 'number' && execId <= 0) {
            console.error('[assistant-chat] Blocking invalid numeric executionId:', execId);
            body.executionId = null;
          }
        }
        
        // SAFEGUARD: Log the request for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log('[assistant-chat] Sending chat request with:', {
            conversationId: body.conversationId,
            executionId: body.executionId,
            hasContext: !!body.context
          });
        }
        
        return fetch(url, {
          ...options,
          body: JSON.stringify(body)
        });
      } catch (error) {
        console.error('[Chat] Error in fetch override:', error);
        // Return the original fetch if parsing fails
        return fetch(url, options);
      }
    }
  })

  // Update internal conversation ID when prop changes
  useEffect(() => {
    setCurrentConversationId(conversationId)
    conversationIdRef.current = conversationId;
  }, [conversationId])

  // Track if we just created a new conversation to avoid fetching empty history
  const [isNewConversation, setIsNewConversation] = useState(false);
  
  // Debug logging for messages
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Chat] Messages updated:', messages.length, 'messages, isLoading:', isLoading);
    }
  }, [messages, isLoading]);

  // Fetch conversation history when conversationId changes
  useEffect(() => {
    if (!currentConversationId || isStreaming || justFinishedStreaming) return;
    
    // Skip fetching if we just created this conversation (it will be empty)
    if (isNewConversation) {
      setIsNewConversation(false);
      return;
    }
    
    // Skip fetching if we already have messages (prevents overwriting streaming responses)
    if (messages.length > 0) {
      return;
    }
    
    const fetchConversationHistory = async () => {
      try {
        const response = await fetch(`/api/chat?conversationId=${currentConversationId}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            // Only set messages if we don't have any (prevents race condition)
            setMessages(prevMessages => {
              if (prevMessages.length === 0) {
                return data.messages.map((msg: SelectMessage) => ({
                  id: msg.id.toString(),
                  role: msg.role,
                  content: msg.content
                }));
              }
              return prevMessages;
            });
          }
        } else {
          console.error("Failed to fetch conversation history");
        }
      } catch (error) {
        console.error("Error fetching conversation history", error);
      }
    };
    fetchConversationHistory();
  }, [currentConversationId, isNewConversation, isStreaming, justFinishedStreaming, messages.length, setMessages]);

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