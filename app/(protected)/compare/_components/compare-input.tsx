"use client"

import { Button } from "@/components/ui/button"
import { ChatInput } from "@/components/ui/chat-input"
import { ModelSelector } from "@/components/features/model-selector"
import { IconPlayerPlay, IconPlayerStop, IconRefresh } from "@tabler/icons-react"
import type { SelectAiModel } from "@/types"
import { useModels } from "@/lib/hooks/use-models"

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
  // Use shared models hook for fetching available models
  const { models } = useModels()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <div className="border-b border-gray-200 p-6 space-y-4">
      {/* Model Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Model 1
          </label>
          <ModelSelector
            models={models}
            value={selectedModel1}
            onChange={onModel1Change}
            requiredCapabilities={["chat"]}
            placeholder="Select first model"
            showDescription={false}
            groupByProvider={true}
            hideRoleRestricted={true}
            hideCapabilityMissing={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Model 2
          </label>
          <ModelSelector
            models={models}
            value={selectedModel2}
            onChange={onModel2Change}
            requiredCapabilities={["chat"]}
            placeholder="Select second model"
            showDescription={false}
            groupByProvider={true}
            hideRoleRestricted={true}
            hideCapabilityMissing={true}
          />
        </div>
      </div>

      {/* Input and Actions */}
      <div className="flex gap-2">
        <div className="flex-1">
          <ChatInput
            input={prompt}
            handleInputChange={(e) => onPromptChange(e.target.value)}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedModel1 || !selectedModel2}
            placeholder="Enter a prompt to compare model responses..."
            ariaLabel="Comparison prompt"
            inputId="compare-prompt-input"
            sendButtonAriaLabel="Compare models"
          />
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isLoading ? (
            hasResponses ? (
              <Button
                onClick={onNewComparison}
                variant="outline"
                size="icon"
                className="h-[48px] w-[48px]"
                aria-label="New comparison"
              >
                <IconRefresh className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={!selectedModel1 || !selectedModel2 || !prompt.trim()}
                size="icon"
                className="h-[48px] w-[48px]"
                aria-label="Start comparison"
              >
                <IconPlayerPlay className="h-4 w-4" />
              </Button>
            )
          ) : (
            <Button
              variant="destructive"
              size="icon"
              className="h-[48px] w-[48px]"
              disabled
              aria-label="Processing"
            >
              <IconPlayerStop className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}