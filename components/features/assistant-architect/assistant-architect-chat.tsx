"use client"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { ChatInput } from "@/components/ui/chat-input"
import { Message } from "@/components/ui/message"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"
import { IconPlayerStop } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"

interface AssistantArchitectChatProps {
  execution: ExecutionResultDetails
  conversationId: number | null
  onConversationCreated?: (id: number) => void
  isPreview?: boolean
}

export const AssistantArchitectChat = memo(function AssistantArchitectChat({ 
  execution, 
  conversationId, 
  onConversationCreated,
  isPreview = false 
}: AssistantArchitectChatProps) {
  const [messages, setMessages] = useState<Array<{ id: string; content: string; role: "user" | "assistant" }>>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [actualModelId, setActualModelId] = useState<string | null>(null) // Store the text model_id
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(conversationId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Update internal conversation ID when prop changes
  useEffect(() => {
    setCurrentConversationId(conversationId)
  }, [conversationId])

  // Fetch the model ID when the component mounts
  useEffect(() => {
    const fetchModelId = async () => {
      if (!execution || !execution.promptResults || execution.promptResults.length === 0) {
        return;
      }
      // Get the last prompt result
      const lastPromptResult = execution.promptResults[execution.promptResults.length - 1];
      try {
        // Fetch the prompt details to get the correct text model ID
        const response = await fetch(`/api/assistant-architect/prompts/${lastPromptResult.promptId}`);
        if (response.ok) {
          const promptData = await response.json();
          // Use the actualModelId (text) provided by the API
          if (promptData && promptData.actualModelId) {
            setActualModelId(promptData.actualModelId);
          } else {
            console.error("No actual AI model ID found in prompt response");
          }
        } else {
          console.error("Failed to fetch prompt details");
        }
      } catch (error) {
        console.error("Error fetching model ID:", error);
      }
    };
    fetchModelId();
  }, [execution]);

  // Fetch conversation history when conversationId changes
  useEffect(() => {
    if (!currentConversationId) return;
    const fetchConversationHistory = async () => {
      try {
        const response = await fetch(`/api/chat?conversationId=${currentConversationId}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.messages)) {
            setMessages(data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content
            })));
          }
        } else {
          console.error("Failed to fetch conversation history");
        }
      } catch (error) {
        console.error("Error fetching conversation history:", error);
      }
    };
    fetchConversationHistory();
  }, [currentConversationId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !actualModelId) return

    const currentInput = input
    setInput("")
    setIsLoading(true)

    // Create user message
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: currentInput
    }
    // Optimistically update UI
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [userMessage],
          conversationId: currentConversationId,
          modelId: actualModelId,
          source: "assistant_execution",
          executionId: isPreview ? null : execution.id,
          context: currentConversationId === null ? {
            promptResults: execution.promptResults.map(result => ({
              input: result.inputData,
              output: result.outputData
            }))
          } : null
        })
      })

      if (!response.ok) {
        throw new Error(response.statusText || "Failed to get response")
      }

      const data = await response.json()
      
      // If this was the first message and we got a new conversation ID
      if (!currentConversationId && data.data?.conversationId) {
        setCurrentConversationId(data.data.conversationId)
        onConversationCreated?.(data.data.conversationId)
      }

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: data.data?.text || data.text || "" // Handle both wrapped and unwrapped responses
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      })
      setMessages(messages)
      setInput(currentInput)
    } finally {
      setIsLoading(false)
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        })
      }
    }
  }, [actualModelId, currentConversationId, input, isLoading, messages, execution, isPreview, toast, onConversationCreated])

  const handleStopGeneration = useCallback(() => {
    setIsLoading(false);
  }, []);

  const MessageList = memo(function MessageList({ messages, isLoading }: { messages: Array<{ id: string; content: string; role: "user" | "assistant" }>, isLoading: boolean }) {
    return (
      <div className="space-y-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
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
        <h3 className="text-sm font-medium">Follow-up</h3>
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
            disabled={!actualModelId}
            placeholder="Follow-up..."
          />
          {isLoading && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleStopGeneration}
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