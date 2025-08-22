"use client"

import { useState, useCallback } from "react"
import { CompareInput } from "./compare-input"
import { DualResponse } from "./dual-response"
import { useToast } from "@/components/ui/use-toast"
import { useModelsWithPersistence } from "@/lib/hooks/use-models"

export function ModelCompare() {
  // Use shared model management hooks
  const model1State = useModelsWithPersistence('compareModel1', ['chat'])
  const model2State = useModelsWithPersistence('compareModel2', ['chat'])
  
  const [prompt, setPrompt] = useState("")
  const [model1Response, setModel1Response] = useState("")
  const [model2Response, setModel2Response] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

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

    // Clear previous responses and start streaming
    setModel1Response("")
    setModel2Response("")
    setIsLoading(true)
    setIsStreaming(true)

    try {
      const response = await fetch('/api/compare-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model1Id: model1State.selectedModel.modelId,
          model2Id: model2State.selectedModel.modelId,
          model1Name: model1State.selectedModel.name,
          model2Name: model2State.selectedModel.name,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start comparison')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
                  if (data.model1) {
                    setModel1Response(prev => prev + data.model1)
                  }
                  
                  if (data.model2) {
                    setModel2Response(prev => prev + data.model2)
                  }

                  if (data.model1Error) {
                    toast({
                      title: "Model 1 Error",
                      description: data.model1Error,
                      variant: "destructive"
                    })
                  }

                  if (data.model2Error) {
                    toast({
                      title: "Model 2 Error", 
                      description: data.model2Error,
                      variant: "destructive"
                    })
                  }

                  if (data.done) {
                    setIsStreaming(false)
                    setIsLoading(false)
                    return
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error) {
      toast({
        title: "Comparison Failed",
        description: error instanceof Error ? error.message : "Failed to compare models",
        variant: "destructive"
      })
    } finally {
      setIsStreaming(false)
      setIsLoading(false)
    }
  }, [model1State.selectedModel, model2State.selectedModel, prompt, toast])

  const handleNewComparison = useCallback(() => {
    setModel1Response("")
    setModel2Response("")
    setPrompt("")
    setIsStreaming(false)
    setIsLoading(false)
  }, [])

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
          isLoading={isLoading}
          onNewComparison={handleNewComparison}
          hasResponses={model1Response.length > 0 || model2Response.length > 0}
        />
        
        <div className="flex-1 overflow-hidden">
          <DualResponse
            model1={{
              model: model1State.selectedModel,
              response: model1Response,
              status: isStreaming ? 'streaming' : 'ready',
              error: undefined
            }}
            model2={{
              model: model2State.selectedModel,
              response: model2Response,
              status: isStreaming ? 'streaming' : 'ready',
              error: undefined
            }}
            onStopModel1={() => {
              setIsStreaming(false)
              setIsLoading(false)
            }}
            onStopModel2={() => {
              setIsStreaming(false)
              setIsLoading(false)
            }}
          />
        </div>
      </div>
    </div>
  )
}