"use client"

import { useState, useCallback } from "react"
import { CompareInput } from "./compare-input"
import { DualResponse } from "./dual-response"
import { useToast } from "@/components/ui/use-toast"
import { useModelsWithPersistence } from "@/lib/hooks/use-models"
import { updateComparisonResults } from "@/actions/db/model-comparison-actions"
import { createLogger, generateRequestId } from "@/lib/logger"

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

    // Clear previous responses and start processing
    setModel1Response("")
    setModel2Response("")
    setIsLoading(true)
    setIsStreaming(true)

    try {
      // Create comparison jobs using new API
      const response = await fetch('/api/compare', {
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
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to start comparison')
      }

      const { job1Id, job2Id, comparisonId } = await response.json()

      // Start polling both jobs
      let job1Complete = false
      let job2Complete = false
      
      const pollJobs = async () => {
        try {
          const [job1Response, job2Response] = await Promise.all([
            fetch(`/api/compare/jobs/${job1Id}`).then(r => r.json()),
            fetch(`/api/compare/jobs/${job2Id}`).then(r => r.json())
          ])
          
          // Update Model 1 response
          if (job1Response.partialContent && !job1Complete) {
            setModel1Response(job1Response.partialContent)
          }
          
          // Update Model 2 response
          if (job2Response.partialContent && !job2Complete) {
            setModel2Response(job2Response.partialContent)
          }
          
          // Handle Model 1 completion
          if (job1Response.status === 'completed' && !job1Complete) {
            job1Complete = true
            if (job1Response.responseData?.text) {
              setModel1Response(job1Response.responseData.text)
            }
          } else if (job1Response.status === 'failed' && !job1Complete) {
            job1Complete = true
            toast({
              title: "Model 1 Error",
              description: job1Response.errorMessage || "Model 1 failed to generate response",
              variant: "destructive"
            })
          }
          
          // Handle Model 2 completion  
          if (job2Response.status === 'completed' && !job2Complete) {
            job2Complete = true
            if (job2Response.responseData?.text) {
              setModel2Response(job2Response.responseData.text)
            }
          } else if (job2Response.status === 'failed' && !job2Complete) {
            job2Complete = true
            toast({
              title: "Model 2 Error", 
              description: job2Response.errorMessage || "Model 2 failed to generate response",
              variant: "destructive"
            })
          }
          
          // Continue polling if jobs are still running
          const shouldContinuePolling = 
            job1Response.shouldContinuePolling || job2Response.shouldContinuePolling
          
          if (shouldContinuePolling) {
            // Use optimal polling interval from job response
            const pollingInterval = Math.min(
              job1Response.pollingInterval || 1000,
              job2Response.pollingInterval || 1000
            )
            setTimeout(pollJobs, pollingInterval)
          } else {
            // Both jobs complete - save final results
            setIsStreaming(false)
            setIsLoading(false)
            
            // Save comparison results to database
            const saveResults = async () => {
              try {
                // Use the final response data from jobs, or fall back to current state
                const finalResponse1 = job1Response.responseData?.text || job1Response.partialContent || ""
                const finalResponse2 = job2Response.responseData?.text || job2Response.partialContent || ""
                
                await updateComparisonResults({
                  comparisonId: parseInt(comparisonId.toString()),
                  response1: finalResponse1,
                  response2: finalResponse2,
                  executionTimeMs1: job1Response.responseData?.executionTime,
                  executionTimeMs2: job2Response.responseData?.executionTime,
                  tokensUsed1: job1Response.responseData?.usage?.totalTokens,
                  tokensUsed2: job2Response.responseData?.usage?.totalTokens
                })
              } catch (error) {
                const requestId = generateRequestId()
                const log = createLogger({ requestId, component: 'ModelCompare' })
                log.error('Failed to save comparison results to database', {
                  comparisonId,
                  error: error instanceof Error ? error.message : String(error),
                  hasJob1Response: !!job1Response.responseData,
                  hasJob2Response: !!job2Response.responseData
                })
              }
            }
            
            saveResults()
          }
        } catch (error) {
          const requestId = generateRequestId()
          const log = createLogger({ requestId, component: 'ModelCompare' })
          log.error('Failed to poll job status', {
            job1Id,
            job2Id,
            error: error instanceof Error ? error.message : String(error),
            job1Complete,
            job2Complete
          })
          
          // Handle polling error - continue polling unless both jobs are done
          if (!job1Complete || !job2Complete) {
            setTimeout(pollJobs, 2000) // Fallback interval
          } else {
            setIsStreaming(false)
            setIsLoading(false)
          }
        }
      }
      
      // Start polling
      pollJobs()
      
    } catch (error) {
      toast({
        title: "Comparison Failed",
        description: error instanceof Error ? error.message : "Failed to compare models",
        variant: "destructive"
      })
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