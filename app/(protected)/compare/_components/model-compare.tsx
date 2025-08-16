"use client"

import { useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { CompareInput } from "./compare-input"
import { DualResponse } from "./dual-response"
import { useToast } from "@/components/ui/use-toast"
import { useModelsWithPersistence } from "@/lib/hooks/use-models"
import { nanoid } from 'nanoid'

export function ModelCompare() {
  // Use shared model management hooks
  const model1State = useModelsWithPersistence('compareModel1', ['chat'])
  const model2State = useModelsWithPersistence('compareModel2', ['chat'])
  
  const [prompt, setPrompt] = useState("")
  const { toast } = useToast()
  
  // Use AI SDK's useChat for model 1
  const chat1 = useChat({
    id: 'compare-model1',
    onError: (error) => {
      toast({
        title: "Model 1 Error",
        description: error.message || "Failed to get response",
        variant: "destructive"
      })
    }
  })
  
  // Use AI SDK's useChat for model 2
  const chat2 = useChat({
    id: 'compare-model2',
    onError: (error) => {
      toast({
        title: "Model 2 Error",
        description: error.message || "Failed to get response",
        variant: "destructive"
      })
    }
  })

  const handleSubmit = useCallback(async () => {
    if (!model1State.selectedModel || !model2State.selectedModel) {
      toast({
        title: "Select both models",
        description: "Please select two models to compare",
        variant: "destructive"
      })
      return
    }

    if (!prompt.trim()) {
      toast({
        title: "Enter a prompt",
        description: "Please enter a prompt to send to the models",
        variant: "destructive"
      })
      return
    }

    if (model1State.selectedModel.id === model2State.selectedModel.id) {
      toast({
        title: "Select different models",
        description: "Please select two different models to compare",
        variant: "destructive"
      })
      return
    }

    // Clear previous messages
    chat1.setMessages([])
    chat2.setMessages([])

    // Create message with unique ID for both
    const messageId = nanoid()
    const userMessage = {
      id: messageId,
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: prompt.trim() }]
    }

    // Send to both models in parallel using AI SDK v2 patterns
    await Promise.all([
      chat1.sendMessage(userMessage, {
        body: {
          modelId: model1State.selectedModel.modelId,
          source: 'chat'
        }
      }),
      chat2.sendMessage(userMessage, {
        body: {
          modelId: model2State.selectedModel.modelId,
          source: 'chat'
        }
      })
    ])
  }, [model1State.selectedModel, model2State.selectedModel, prompt, chat1, chat2, toast])

  const handleNewComparison = useCallback(() => {
    chat1.setMessages([])
    chat2.setMessages([])
    setPrompt("")
  }, [chat1, chat2])

  // Extract the latest assistant message content
  const getLatestResponse = (messages: typeof chat1.messages) => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return ""
    
    // Handle AI SDK v2 message format
    if ('parts' in lastAssistant && Array.isArray(lastAssistant.parts)) {
      return lastAssistant.parts
        .filter((part) => part.type === 'text')
        .map((part) => 'text' in part ? part.text || '' : '')
        .join('')
    }
    
    // Fallback for legacy format
    if ('content' in lastAssistant && typeof lastAssistant.content === 'string') {
      return lastAssistant.content
    }
    
    return ""
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Model Comparison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare how different AI models respond to the same prompt
        </p>
      </div>

      {/* Main Content Container */}
      <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
        <CompareInput
          prompt={prompt}
          onPromptChange={setPrompt}
          selectedModel1={model1State.selectedModel}
          selectedModel2={model2State.selectedModel}
          onModel1Change={model1State.setSelectedModel}
          onModel2Change={model2State.setSelectedModel}
          onSubmit={handleSubmit}
          isLoading={chat1.status !== 'ready' || chat2.status !== 'ready'}
          onNewComparison={handleNewComparison}
          hasResponses={chat1.messages.length > 0 || chat2.messages.length > 0}
        />
        
        <div className="flex-1 overflow-hidden">
          <DualResponse
            model1={{
              model: model1State.selectedModel,
              response: getLatestResponse(chat1.messages),
              status: chat1.status === 'streaming' || chat1.status === 'submitted' ? 'streaming' : 
                     chat1.error ? 'error' : 'ready',
              error: chat1.error?.message
            }}
            model2={{
              model: model2State.selectedModel,
              response: getLatestResponse(chat2.messages),
              status: chat2.status === 'streaming' || chat2.status === 'submitted' ? 'streaming' : 
                     chat2.error ? 'error' : 'ready',
              error: chat2.error?.message
            }}
            onStopModel1={() => chat1.stop()}
            onStopModel2={() => chat2.stop()}
          />
        </div>
      </div>
    </div>
  )
}