"use client"

import { useState, useCallback, useRef } from "react"
import type { SelectAiModel } from "@/types"

interface ComparisonState {
  model1: string
  model2: string
  error1?: string
  error2?: string
}

interface LoadingState {
  model1: 'ready' | 'submitted' | 'streaming' | 'error'
  model2: 'ready' | 'submitted' | 'streaming' | 'error'
}

interface StreamComparisonParams {
  prompt: string
  model1: SelectAiModel
  model2: SelectAiModel
}

export function useComparisonV2() {
  const [responses, setResponses] = useState<ComparisonState>({
    model1: "",
    model2: ""
  })
  
  const [status, setStatus] = useState<LoadingState>({
    model1: 'ready',
    model2: 'ready'
  })
  
  const abortControllerRef = useRef<{
    model1?: AbortController
    model2?: AbortController
  }>({})

  const streamComparison = useCallback(async ({
    prompt,
    model1,
    model2
  }: StreamComparisonParams) => {
    // Reset state
    setResponses({ model1: "", model2: "" })
    setStatus({ model1: 'submitted', model2: 'submitted' })
    
    // Create new abort controllers
    abortControllerRef.current = {
      model1: new AbortController(),
      model2: new AbortController()
    }

    // Add a small delay to show "thinking" state for UX consistency
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      const response = await fetch('/api/compare-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model1Id: model1.modelId,
          model2Id: model2.modelId,
          model1Name: model1.name,
          model2Name: model2.name
        }),
        signal: abortControllerRef.current.model1?.signal
      })

      if (!response.ok) {
        throw new Error('Failed to start comparison')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      // Start streaming for both models
      setStatus({ model1: 'streaming', model2: 'streaming' })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              // Handle model1 data
              if ('model1' in data) {
                setResponses(prev => ({ ...prev, model1: prev.model1 + data.model1 }))
                setStatus(prev => ({ ...prev, model1: 'streaming' }))
              } else if ('model1Error' in data) {
                setResponses(prev => ({ ...prev, error1: data.model1Error }))
                setStatus(prev => ({ ...prev, model1: 'error' }))
              } else if ('model1Finished' in data) {
                setStatus(prev => ({ ...prev, model1: 'ready' }))
              }
              
              // Handle model2 data
              if ('model2' in data) {
                setResponses(prev => ({ ...prev, model2: prev.model2 + data.model2 }))
                setStatus(prev => ({ ...prev, model2: 'streaming' }))
              } else if ('model2Error' in data) {
                setResponses(prev => ({ ...prev, error2: data.model2Error }))
                setStatus(prev => ({ ...prev, model2: 'error' }))
              } else if ('model2Finished' in data) {
                setStatus(prev => ({ ...prev, model2: 'ready' }))
              }
              
              // Handle overall completion
              if ('done' in data) {
                setStatus({ model1: 'ready', model2: 'ready' })
              }
            } catch {
              // Failed to parse SSE data - silently handle
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setResponses(prev => ({
          ...prev,
          error1: prev.error1 || 'Failed to complete comparison',
          error2: prev.error2 || 'Failed to complete comparison'
        }))
        setStatus({ model1: 'error', model2: 'error' })
      }
    }
  }, [])

  const stopStream = useCallback((model: 'model1' | 'model2' | 'both') => {
    if (model === 'both') {
      abortControllerRef.current.model1?.abort()
      abortControllerRef.current.model2?.abort()
      setStatus({ model1: 'ready', model2: 'ready' })
    } else {
      abortControllerRef.current[model]?.abort()
      setStatus(prev => ({ ...prev, [model]: 'ready' }))
    }
  }, [])

  const clearResponses = useCallback(() => {
    setResponses({ model1: "", model2: "" })
    setStatus({ model1: 'ready', model2: 'ready' })
    abortControllerRef.current = {}
  }, [])

  return {
    responses,
    status,
    streamComparison,
    stopStream,
    clearResponses
  }
}