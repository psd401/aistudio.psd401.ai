"use client"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { ChatInput } from "@/components/ui/chat-input"
import { Message } from "@/components/ui/message"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"
import { SelectConversation } from "@/types"
import { IconPlayerStop } from "@tabler/icons-react"

interface AssistantArchitectChatProps {
  execution: ExecutionResultDetails
  isPreview?: boolean
}

export const AssistantArchitectChat = memo(function AssistantArchitectChat({ execution, isPreview = false }: AssistantArchitectChatProps) {
  const [messages, setMessages] = useState<Array<{ id: string; content: string; role: "user" | "assistant" }>>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [actualModelId, setActualModelId] = useState<string | null>(null) // Store the text model_id
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null) // Store the conversation ID
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

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
            console.log("Found actual AI model ID:", promptData.actualModelId);
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
          messages: [userMessage], // Only send the new user message
          conversationId: currentConversationId, // Send existing ID if available
          modelId: actualModelId,
          source: "assistant_execution",
          executionId: isPreview ? null : execution.id,
          context: currentConversationId === null ? { // Only send context on first message
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

      // Update conversation ID if it's the first message
      if (!currentConversationId && data.conversationId) {
        setCurrentConversationId(data.conversationId);
      }

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: data.text
      }
      
      // Add assistant message to state
      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      })
      // Revert optimistic update on error
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
  }, [actualModelId, currentConversationId, input, isLoading, messages, execution, isPreview, toast])

  const handleStopGeneration = useCallback(() => {
    setIsLoading(false);
  }, []);

  const MessageList = memo(function MessageList({ messages }: { messages: Array<{ id: string; content: string; role: "user" | "assistant" }> }) {
    return (
      <div className="space-y-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {messages.length === 0 && (
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
        <MessageList messages={messages} />
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex items-end gap-2">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!actualModelId} // Disable if text model_id isn't loaded
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