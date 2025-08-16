"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Message } from "@/app/(protected)/chat/_components/message"
import { IconPlayerStop, IconCopy, IconCheck, IconLoader2 } from "@tabler/icons-react"
import type { SelectAiModel } from "@/types"
import type { SelectMessage } from "@/types/schema-types"
import { nanoid } from 'nanoid'

interface ModelResponse {
  model: SelectAiModel | null
  response: string
  status: 'ready' | 'streaming' | 'error'
  error?: string
}

interface DualResponseProps {
  model1: ModelResponse
  model2: ModelResponse
  onStopModel1: () => void
  onStopModel2: () => void
}

export function DualResponse({
  model1,
  model2,
  onStopModel1,
  onStopModel2
}: DualResponseProps) {
  const [copiedModel, setCopiedModel] = useState<'model1' | 'model2' | null>(null)

  const handleCopy = async (text: string, model: 'model1' | 'model2') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedModel(model)
      setTimeout(() => setCopiedModel(null), 2000)
    } catch {
      // Failed to copy - silently handle
    }
  }

  const renderResponse = (response: ModelResponse, modelKey: 'model1' | 'model2', onStop: () => void) => {
    const hasContent = response.response || response.error || response.status !== 'ready'

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
          <h3 className="font-semibold text-sm text-gray-900">
            {response.model?.name || 'Select a model'}
          </h3>
          <div className="flex items-center gap-2">
            {response.status === 'streaming' && (
              <Button
                onClick={onStop}
                size="sm"
                variant="ghost"
                className="h-7 px-2"
              >
                <IconPlayerStop className="h-3 w-3" />
              </Button>
            )}
            {response.response && (
              <Button
                onClick={() => handleCopy(response.response, modelKey)}
                size="sm"
                variant="ghost"
                className="h-7 px-2"
              >
                {copiedModel === modelKey ? (
                  <IconCheck className="h-3 w-3 text-green-500" />
                ) : (
                  <IconCopy className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {!hasContent && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Responses will appear here</p>
            </div>
          )}
          
          {response.error && (
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              {response.error}
            </div>
          )}
          
          {response.status === 'streaming' && !response.response && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconLoader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {response.model?.name || 'Model'} is thinking...
              </span>
            </div>
          )}
          
          {response.response && (
            <Message 
              message={{
                id: parseInt(nanoid(6), 36), // Generate numeric-like id
                content: response.response,
                role: 'assistant',
                modelName: response.model?.name,
                modelProvider: response.model?.provider,
                conversationId: 0,
                userId: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                tokenUsage: null,
                reasoning_content: null,
                modelId: null,
                modelIdentifier: null
              } as SelectMessage}
              messageId={`${modelKey}-response`}
            />
          )}
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-gray-200 h-full">
      {renderResponse(model1, 'model1', onStopModel1)}
      {renderResponse(model2, 'model2', onStopModel2)}
    </div>
  )
}