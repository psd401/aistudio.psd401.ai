"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ModelSelector } from "@/components/features/model-selector"
import { IconPlayerPlay, IconPlayerStop, IconRefresh } from "@tabler/icons-react"
import type { SelectAiModel } from "@/types"

interface CompareInputProps {
  prompt: string
  onPromptChange: (value: string) => void
  selectedModel1: SelectAiModel | null
  selectedModel2: SelectAiModel | null
  onModel1Change: (model: SelectAiModel) => void
  onModel2Change: (model: SelectAiModel) => void
  onSubmit: () => void
  isLoading: boolean
  onNewComparison: () => void
  hasResponses: boolean
}

export function CompareInput({
  prompt,
  onPromptChange,
  selectedModel1,
  selectedModel2,
  onModel1Change,
  onModel2Change,
  onSubmit,
  isLoading,
  onNewComparison,
  hasResponses
}: CompareInputProps) {
  const [models, setModels] = useState<SelectAiModel[]>([])

  useEffect(() => {
    // Fetch available models
    fetch('/api/chat/models')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          // The API already returns camelCase, no transformation needed!
          const transformedModels = data.data
          setModels(transformedModels)
          // Auto-select first two different models if available
          if (transformedModels.length >= 2 && !selectedModel1 && !selectedModel2) {
            onModel1Change(transformedModels[0])
            onModel2Change(transformedModels[1])
          }
        }
      })
      .catch(() => {
        // Silently handle error - models will remain empty
      })
  }, [selectedModel1, selectedModel2, onModel1Change, onModel2Change])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && prompt.trim()) {
        onSubmit()
      }
    }
  }

  return (
    <div className="border-b border-gray-200 bg-gray-50 p-6 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Enter your prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your prompt here to compare model responses..."
          className="min-h-[120px] resize-none bg-white"
          disabled={isLoading}
        />
      </div>
      
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Model 1:</span>
          <ModelSelector
            models={models}
            value={selectedModel1}
            onChange={onModel1Change}
            placeholder="Select first model"
            showDescription={true}
            groupByProvider={true}
            requiredCapabilities={["chat"]}
            hideRoleRestricted={true}
            hideCapabilityMissing={true}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Model 2:</span>
          <ModelSelector
            models={models}
            value={selectedModel2}
            onChange={onModel2Change}
            placeholder="Select second model"
            showDescription={true}
            groupByProvider={true}
            requiredCapabilities={["chat"]}
            hideRoleRestricted={true}
            hideCapabilityMissing={true}
          />
        </div>
        
        <div className="ml-auto flex gap-2">
          {hasResponses && !isLoading && (
            <Button
              onClick={onNewComparison}
              variant="outline"
              size="default"
            >
              <IconRefresh className="h-4 w-4 mr-2" />
              New Comparison
            </Button>
          )}
          
          <Button
            onClick={onSubmit}
            disabled={isLoading || !prompt.trim() || !selectedModel1 || !selectedModel2}
            size="default"
          >
            {isLoading ? (
              <>
                <IconPlayerStop className="h-4 w-4 mr-2" />
                Running...
              </>
            ) : (
              <>
                <IconPlayerPlay className="h-4 w-4 mr-2" />
                Compare Models
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}