"use client"

import { useEffect, useRef, useState } from "react"
import { Message } from "./message"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { IconPlayerStop } from "@tabler/icons-react"
import type { SelectAiModel } from "@/types"

interface ChatProps {
  conversationId?: number
  title: string
  initialMessages?: Array<{
    id: string
    content: string
    role: "user" | "assistant"
  }>
}

export function Chat({ conversationId, title, initialMessages = [] }: ChatProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [models, setModels] = useState<SelectAiModel[]>([])
  const [selectedModel, setSelectedModel] = useState<SelectAiModel | null>(null)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    console.log("[Chat] initialMessages prop changed, updating state:", initialMessages);
    setMessages(initialMessages);
  }, [initialMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive"
      })
      return
    }
    if (!selectedModel) {
      toast({
        title: "Error",
        description: "Please select a model",
        variant: "destructive"
      })
      return
    }

    console.log('[handleSubmit] Starting submission with model:', selectedModel)
    setIsLoading(true)
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: input
    }
    setMessages(prev => [...prev, userMessage])
    setInput("")

    try {
      console.log('[handleSubmit] Sending request:', {
        messages: [...messages, userMessage],
        conversationId,
        modelConfig: selectedModel 
      })
      
      const currentConversationId = conversationId;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          conversationId: currentConversationId,
          modelConfig: selectedModel 
        })
      })

      console.log('[handleSubmit] Response status:', response.status)
      const contentType = response.headers.get('Content-Type')
      console.log('[handleSubmit] Response content type:', contentType)

      if (!response.ok) {
        let errorMessage = response.statusText
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
        }
        throw new Error(errorMessage)
      }

      const text = await response.text()
      console.log('[handleSubmit] Received response text:', text)

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: text
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('[handleSubmit] Error:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      })
      // Remove the user message if the request failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id))
      setInput(userMessage.content) // Restore the input
    } finally {
      setIsLoading(false)
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        })
      }
    }
  }

  useEffect(() => {
    async function loadModels() {
      try {
        console.log('[loadModels] Fetching models...')
        const response = await fetch("/api/models")
        if (!response.ok) throw new Error("Failed to load models")
        const data = await response.json()
        console.log('[loadModels] Received models:', data)
        const chatModels = data.filter((m: SelectAiModel) => m.chatEnabled)
        console.log('[loadModels] Chat-enabled models:', chatModels)
        setModels(chatModels)
        if (chatModels.length > 0) {
          setSelectedModel(chatModels[0])
        }
      } catch (error) {
        console.error('[loadModels] Error:', error)
        toast({
          title: "Error",
          description: "Failed to load models",
          variant: "destructive"
        })
      }
    }
    loadModels()
  }, [toast])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      })
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center justify-start p-3 border-b border-border">
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelSelect={setSelectedModel}
        />
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <div className="flex items-end gap-2">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedModel}
          />
          {isLoading && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsLoading(false)}
              aria-label="Stop generation"
            >
              <IconPlayerStop className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 