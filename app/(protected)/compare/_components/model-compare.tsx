"use client"

import { useState, useCallback } from "react"
import { useComparison } from "./use-comparison"
import { CompareInput } from "./compare-input"
import { DualResponse } from "./dual-response"
import { useToast } from "@/components/ui/use-toast"
import type { SelectAiModel } from "@/types"

export function ModelCompare() {
  const [selectedModel1, setSelectedModel1] = useState<SelectAiModel | null>(null)
  const [selectedModel2, setSelectedModel2] = useState<SelectAiModel | null>(null)
  const [prompt, setPrompt] = useState("")
  const { toast } = useToast()
  
  const {
    responses,
    isLoading,
    streamComparison,
    stopStream,
    clearResponses
  } = useComparison()

  const handleSubmit = useCallback(async () => {
    if (!selectedModel1 || !selectedModel2) {
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

    if (selectedModel1.id === selectedModel2.id) {
      toast({
        title: "Select different models",
        description: "Please select two different models to compare",
        variant: "destructive"
      })
      return
    }

    await streamComparison({
      prompt: prompt.trim(),
      model1: selectedModel1,
      model2: selectedModel2
    })
  }, [selectedModel1, selectedModel2, prompt, streamComparison, toast])

  const handleNewComparison = useCallback(() => {
    clearResponses()
    setPrompt("")
  }, [clearResponses])

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
          selectedModel1={selectedModel1}
          selectedModel2={selectedModel2}
          onModel1Change={setSelectedModel1}
          onModel2Change={setSelectedModel2}
          onSubmit={handleSubmit}
          isLoading={isLoading.model1 || isLoading.model2}
          onNewComparison={handleNewComparison}
          hasResponses={!!responses.model1 || !!responses.model2}
        />
        
        <div className="flex-1 overflow-hidden">
          <DualResponse
            model1={{
              model: selectedModel1,
              response: responses.model1,
              isLoading: isLoading.model1,
              error: responses.error1
            }}
            model2={{
              model: selectedModel2,
              response: responses.model2,
              isLoading: isLoading.model2,
              error: responses.error2
            }}
            onStopModel1={() => stopStream('model1')}
            onStopModel2={() => stopStream('model2')}
          />
        </div>
      </div>
    </div>
  )
}