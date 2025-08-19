"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect, useCallback, memo } from "react"
import { useToast } from "@/components/ui/use-toast"
import { executeAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { getJobAction } from "@/actions/db/jobs-actions"
import { SelectJob, SelectToolInputField } from "@/types/db-types"
import { ExecutionResultDetails, JobOutput, JobPromptResult } from "@/types/assistant-architect-types"
import { Loader2, Bot, User, Terminal, AlertCircle, ChevronDown, ChevronRight, Copy, ThumbsUp, ThumbsDown, Sparkles, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { ErrorBoundary } from "@/components/error-boundary"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AssistantArchitectChat } from "./assistant-architect-chat"
import { ChatErrorBoundary } from "./chat-error-boundary"
import Image from "next/image"
import PdfUploadButton from "@/components/ui/pdf-upload-button"
import { updatePromptResultAction } from "@/actions/db/assistant-architect-actions"
import { useCompletion } from '@ai-sdk/react'

interface AssistantArchitectExecutionProps {
  tool: AssistantArchitectWithRelations
  isPreview?: boolean
}

// Extended type for prompt results used in this component
interface ExtendedPromptResult {
  id: string
  executionId: string
  promptId: string | number
  inputData: Record<string, unknown>
  outputData: string
  status: "pending" | "running" | "completed" | "failed"
  startedAt: Date
  completedAt: Date | null
  executionTimeMs: number | null
  errorMessage: string | null
  userFeedback?: 'like' | 'dislike'
}

// Extended execution result details
interface ExtendedExecutionResultDetails {
  id: string | number
  toolId: string | number
  userId: string | number
  status: string
  inputData: Record<string, unknown>
  startedAt: Date | null
  completedAt: Date | null
  errorMessage: string | null
  promptResults: ExtendedPromptResult[]
  assistantArchitectId?: number // Add this field for compatibility with ExecutionResultDetails
}

export const AssistantArchitectExecution = memo(function AssistantArchitectExecution({ tool, isPreview = false }: AssistantArchitectExecutionProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<ExtendedExecutionResultDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({})
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [currentPromptIndex, setCurrentPromptIndex] = useState<number>(-1)
  const [executionId, setExecutionId] = useState<number | null>(null)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})

  // Define base types for fields first
  const stringSchema = z.string();

  // Create form schema based on tool input fields
  const formSchema = z.object(
    tool.inputFields.reduce((acc: Record<string, z.ZodTypeAny>, field: SelectToolInputField) => {
      let fieldSchema: z.ZodString | z.ZodTypeAny

      switch (field.fieldType) {
        case "long_text":
        case "select":
        case "multi_select":
          fieldSchema = stringSchema
          break
        case "file_upload":
          fieldSchema = stringSchema
          break
        default:
          fieldSchema = stringSchema
      }

      // Make field optional by default
      fieldSchema = fieldSchema.optional().nullable()

      acc[field.name] = fieldSchema
      return acc
    }, {})
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: tool.inputFields.reduce((acc: Record<string, string>, field: SelectToolInputField) => {
      acc[field.name] = ""
      return acc
    }, {})
  })


  // Use AI SDK's useCompletion hook for each prompt
  const { 
    completion,
    complete,
    stop,
    isLoading: isStreaming,
    setCompletion
  } = useCompletion({
    api: '/api/assistant-architect/stream',
    onFinish: () => {
      // Update the current prompt result with the completion
      if (currentPromptIndex >= 0 && results) {
        setResults(prev => {
          if (!prev) return null
          const updated = { ...prev }
          if (updated.promptResults[currentPromptIndex]) {
            updated.promptResults[currentPromptIndex] = {
              ...updated.promptResults[currentPromptIndex],
              status: 'completed' as const,
              outputData: completion,
              completedAt: new Date(),
              executionTimeMs: Date.now() - updated.promptResults[currentPromptIndex].startedAt.getTime()
            }
          }
          return updated
        })
        
        // Process next prompt if there are more
        const nextIndex = currentPromptIndex + 1
        if (nextIndex < tool.prompts.length) {
          setCurrentPromptIndex(nextIndex)
          processNextPrompt(nextIndex)
        } else {
          // All prompts completed
          setIsLoading(false)
          setCurrentPromptIndex(-1)
          toast({
            title: "Execution Completed",
            description: "All prompts have been executed successfully"
          })
        }
      }
    },
    onError: (error) => {
      // Update the current prompt result with error
      if (currentPromptIndex >= 0 && results) {
        setResults(prev => {
          if (!prev) return null
          const updated = { ...prev }
          if (updated.promptResults[currentPromptIndex]) {
            updated.promptResults[currentPromptIndex] = {
              ...updated.promptResults[currentPromptIndex],
              status: 'failed' as const,
              errorMessage: error.message,
              completedAt: new Date()
            }
          }
          return updated
        })
      }
      
      setIsLoading(false)
      setError(error.message)
      toast({
        title: "Execution Error",
        description: error.message,
        variant: "destructive"
      })
    }
  })

  const processNextPrompt = useCallback(async (promptIndex: number) => {
    if (!executionId || !formValues) return
    
    // Clear previous completion
    setCompletion('')
    
    // Update prompt status to running
    setResults(prev => {
      if (!prev) return null
      const updated = { ...prev }
      if (updated.promptResults[promptIndex]) {
        updated.promptResults[promptIndex] = {
          ...updated.promptResults[promptIndex],
          status: 'running' as const,
          startedAt: new Date()
        }
      }
      return updated
    })
    
    // Auto-expand the currently streaming prompt
    const promptId = `prompt_${promptIndex}_temp`
    setExpandedPrompts(prev => ({ ...prev, [promptId]: true }))
    
    // Stream this prompt using the AI SDK
    await complete('', {
      body: {
        toolId: tool.id,
        executionId,
        inputs: formValues,
        promptIndex
      }
    })
  }, [executionId, formValues, tool.id, complete, setCompletion])

  const onSubmit = useCallback(async (values: z.infer<typeof formSchema>) => {
    // Only clear results if we're not already processing
    if (!isLoading && !isPolling) {
      // Don't clear results if we already have completed results - user might be using chat
      if (!results || results.status !== 'completed') {
        setIsLoading(true)
        setResults(null)
        setError(null)
      } else {
        // If we have completed results, confirm before re-running
        const confirmRerun = window.confirm("You have existing results. Do you want to run the assistant again? This will clear your current results and chat.")
        if (!confirmRerun) {
          return;
        }
        setIsLoading(true)
        setResults(null)
        setError(null)
        setConversationId(null) // Reset conversation when re-running
      }
    } else {
      return; // Prevent double submission
    }

    try {
      const result = await executeAssistantArchitectAction({
        toolId: tool.id,
        inputs: values
      })

      if (result.isSuccess && result.data?.jobId) {
        setJobId(String(result.data.jobId))
        
        // Check if we have executionId for streaming support
        const supportsStreaming = !!result.data?.executionId
        
        if (supportsStreaming && result.data?.executionId) {
          // Store execution context
          setExecutionId(result.data.executionId)
          setFormValues(values)
          
          // Initialize results structure
          const initialResults: ExtendedExecutionResultDetails = {
            id: result.data.executionId,
            toolId: tool.id,
            userId: 'current',
            status: 'running',
            inputData: values,
            startedAt: new Date(),
            completedAt: null,
            errorMessage: null,
            assistantArchitectId: tool.id,
            promptResults: tool.prompts.map((prompt, i) => ({
              id: `prompt_${i}_temp`,
              executionId: String(result.data.executionId),
              promptId: prompt.id,
              inputData: values,
              outputData: '',
              status: 'pending' as const,
              startedAt: new Date(),
              completedAt: null,
              executionTimeMs: null,
              errorMessage: null
            }))
          }
          setResults(initialResults)
          
          // Start streaming the first prompt
          setCurrentPromptIndex(0)
          processNextPrompt(0)
          
        } else {
          // Use polling for older executions without executionId
          setIsPolling(true)
        }
        
        toast({ title: "Execution Started", description: "The tool is now running" })
      } else {
        const errorMessage = result.message || "Failed to start execution"
        setError(errorMessage)
        toast({
          title: "Execution Failed",
          description: errorMessage,
          variant: "destructive"
        })
        setIsLoading(false)
      }
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "Failed to start execution"
      setError(errorMessage)
      toast({
        title: "Execution Error",
        description: errorMessage,
        variant: "destructive"
      })
      setIsLoading(false)
    }
  }, [isLoading, isPolling, tool.id, results, toast, processNextPrompt, tool.prompts])

  // Update the form values type
  const safeJsonParse = useCallback((jsonString: string | null | undefined): Record<string, unknown> | null => {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch {
      if (typeof jsonString === 'string') {
        return { value: jsonString };
      }
      return null;
    }
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    let intervalId: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let retryCount = 0
    const MAX_RETRIES = 120
    const BACKOFF_THRESHOLD = 20
    let currentInterval = 3000

    async function pollJob() {
      if (!jobId || abortController.signal.aborted) return
      
      try {
        const result = await getJobAction(jobId)
        // Check if request was aborted before updating state
        if (abortController.signal.aborted) return
        retryCount++

        if (result.isSuccess && result.data) {
          const job = result.data as SelectJob

          if (job.status === "completed" || job.status === "failed") {
            setIsLoading(false)
            setIsPolling(false)

            // Try to extract error from job output first, then fall back to job.error
            const outputData = safeJsonParse(job.output) as JobOutput | null;
            const inputData = safeJsonParse(job.input);
            
            // Check for errors in the output data
            let jobError = job.error;
            if (!jobError && outputData && outputData.results && outputData.results.length > 0) {
              const failedResult = outputData.results.find(r => r.status === 'failed');
              if (failedResult && failedResult.error) {
                jobError = failedResult.error;
              }
            }
            
            // Final fallback if still no error message
            if (!jobError && job.status === "failed") {
              jobError = "Execution failed without a specific error message";
            }
            
            if (jobError) {
              setError(jobError)
            }

            if (outputData) {
              const promptResultsForState: ExtendedPromptResult[] = outputData.results.map((res: JobPromptResult) => ({
                id: res.promptId + "_" + outputData.executionId,
                executionId: outputData.executionId,
                promptId: typeof res.promptId === 'number' ? res.promptId : parseInt(res.promptId),
                inputData: res.input,
                outputData: res.output || '',
                status: res.status as "pending" | "completed" | "failed",
                startedAt: new Date(res.startTime),
                completedAt: res.endTime ? new Date(res.endTime) : null,
                executionTimeMs: res.executionTimeMs || 0,
                errorMessage: res.error || (res.status === 'failed' ? 'Prompt execution failed' : null),
                userFeedback: res.userFeedback
              }));

              // Initialize expandedPrompts with all collapsed except the last one
              // and expandedInputs with all collapsed
              if (promptResultsForState.length > 0) {
                const lastPromptId = promptResultsForState[promptResultsForState.length - 1].id;
                const newExpandedPrompts = promptResultsForState.reduce((acc, prompt) => {
                  acc[prompt.id] = prompt.id === lastPromptId;
                  return acc;
                }, {} as Record<string, boolean>);
                const newExpandedInputs = promptResultsForState.reduce((acc, prompt) => {
                  acc[prompt.id] = false;
                  return acc;
                }, {} as Record<string, boolean>);
                setExpandedPrompts(newExpandedPrompts);
                setExpandedInputs(newExpandedInputs);
              }

              setResults({
                id: outputData.executionId,
                toolId: tool?.id || 0,
                userId: job.userId,
                status: job.status,
                inputData: inputData || {},
                startedAt: new Date(job.createdAt),
                completedAt: new Date(job.updatedAt),
                errorMessage: jobError,
                assistantArchitectId: tool?.id,
                promptResults: promptResultsForState
              })
            } else if (job.status === 'failed') {
              setResults({
                id: jobId,
                toolId: tool?.id || 0,
                userId: job.userId,
                status: job.status,
                inputData: inputData || {},
                startedAt: new Date(job.createdAt),
                completedAt: new Date(job.updatedAt),
                errorMessage: jobError || "Execution failed, and output data was not available.",
                assistantArchitectId: tool?.id,
                promptResults: []
              })
            }

            toast({
              title: "Execution Finished",
              description: `Status: ${job.status}${jobError ? ` - ${jobError}` : ""}`,
              variant: job.status === "completed" ? "default" : "destructive"
            })

            if (intervalId) {
              clearInterval(intervalId)
            }
          }
        } else {
           retryCount++
        }
      } catch {
        retryCount++
      }

      if (retryCount >= MAX_RETRIES) {
        setIsLoading(false)
        setIsPolling(false)
        const timeoutError = "The execution took too long to complete"
        setError(timeoutError)
         if (results) {
            setResults(prev => prev ? {...prev, status: 'failed', errorMessage: timeoutError} : null);
         } else {
             const formValues = form.getValues();
             const inputData = Object.entries(formValues).reduce((acc, [key, value]) => {
               acc[key] = value;
               return acc;
             }, {} as Record<string, unknown>);
             
             setResults({
                 id: jobId || 'unknown',
                 toolId: tool?.id || 0,
                 userId: 'unknown',
                 status: 'failed',
                 inputData,
                 startedAt: new Date(),
                 completedAt: new Date(),
                 errorMessage: timeoutError,
                 assistantArchitectId: tool?.id,
                 promptResults: [],
             });
         }
        toast({
          title: "Execution Timeout",
          description: timeoutError,
          variant: "destructive"
        })
        if (intervalId) {
          clearInterval(intervalId)
        }
        return
      }

      if (retryCount > BACKOFF_THRESHOLD && currentInterval === 3000) {
         currentInterval = 5000
         if (intervalId) {
           clearInterval(intervalId)
           intervalId = null // Clear reference to prevent accumulation
         }
         intervalId = setInterval(pollJob, currentInterval)
       }
    }

    if (isPolling) {
      pollJob();
      intervalId = setInterval(pollJob, currentInterval)
    }

    return () => {
      // Comprehensive cleanup
      abortController.abort() // Cancel any pending operations
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  }, [isPolling, jobId, tool.id, toast, form, results, safeJsonParse])

  const togglePromptExpand = useCallback((promptResultId: string) => {
    setExpandedPrompts(prev => ({
      ...prev,
      [promptResultId]: !prev[promptResultId]
    }))
  }, [])

  const toggleInputExpand = useCallback((promptResultId: string) => {
    setExpandedInputs(prev => ({
      ...prev,
      [promptResultId]: !prev[promptResultId]
    }))
  }, [])

  const copyToClipboard = useCallback(async (text: string | null | undefined) => {
    if (!text) {
       toast({ description: "Nothing to copy", duration: 1500 });
       return;
    }
    try {
      await navigator.clipboard.writeText(text)
      toast({
        description: "Copied to clipboard",
        duration: 2000
      })
    } catch {
      toast({
        description: "Failed to copy to clipboard",
        variant: "destructive"
      })
    }
  }, [toast])

  const handleFeedback = async (promptResult: { executionId: string; promptId: string | number; id: string }, feedback: string) => {
    try {
      const promptIdNum = typeof promptResult.promptId === 'string' ? parseInt(promptResult.promptId) : promptResult.promptId
      await updatePromptResultAction(promptResult.executionId, promptIdNum, { userFeedback: feedback })
      setResults(prev => {
        if (!prev) return prev
        return {
          ...prev,
          promptResults: prev.promptResults.map(pr =>
            pr.id === promptResult.id ? { ...pr, userFeedback: feedback as 'like' | 'dislike' } : pr
          )
        }
      })
      toast({ title: `Feedback submitted: ${feedback}` })
    } catch {
      toast({ title: 'Failed to submit feedback', variant: 'destructive' })
    }
  }

  // Memoized components for better performance
  const ToolHeader = memo(({ tool }: { tool: AssistantArchitectWithRelations }) => (
    <div>
      <div className="flex items-start gap-4">
        {tool.imagePath && (
          <div className="relative w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-muted/20 p-1">
            <div className="relative w-full h-full rounded-lg overflow-hidden ring-1 ring-black/10">
              <Image
                src={`/assistant_logos/${tool.imagePath}`}
                alt={tool.name}
                fill
                className="object-cover"
              />
            </div>
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold">{tool.name}</h2>
          <p className="text-muted-foreground">{tool.description}</p>
        </div>
      </div>
      <div className="h-px bg-border mt-6" />
    </div>
  ));

  const ErrorAlert = memo(({ errorMessage }: { errorMessage: string }) => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Execution Error</AlertTitle>
      <AlertDescription className="mt-2 text-sm">
        {errorMessage}
      </AlertDescription>
    </Alert>
  ));

  const ResultsErrorAlert = memo(({ status, errorMessage }: { status: string, errorMessage: string }) => (
    <Alert variant={status === 'failed' ? "destructive" : "warning"}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{status === 'failed' ? 'Execution Failed' : 'Execution Warning'}</AlertTitle>
      <AlertDescription className="mt-2 text-sm">
        {errorMessage}
      </AlertDescription>
    </Alert>
  ));

  // 1. Add a utility to reconstruct the processed prompt
  function getPromptTemplateAndContext(promptId: string | number) {
    const promptIdStr = String(promptId)
    const prompt = tool?.prompts?.find(p => String(p.id) === promptIdStr)
    return prompt ? { template: prompt.content, context: prompt.systemContext } : { template: '', context: '' }
  }

  // Add a function to decode HTML entities and remove escapes for variable placeholders
  function decodePromptVariables(content: string): string {
    // Replace HTML entity for $ with $
    let decoded = content.replace(/&#x24;|&\#36;/g, '$');
    // Remove backslash escapes before $
    decoded = decoded.replace(/\\\$/g, '$');
    // Remove backslash escapes before {
    decoded = decoded.replace(/\\\{/g, '{');
    // Remove backslash escapes before }
    decoded = decoded.replace(/\\\}/g, '}');
    // Remove backslash escapes before _
    decoded = decoded.replace(/\\_/g, '_');
    return decoded;
  }

  function substitutePromptVariables(template: string, inputData: Record<string, unknown>) {
    const decodedTemplate = decodePromptVariables(template);
    return decodedTemplate.replace(/\${(\w+)}/g, (_match, key) => {
      const value = inputData[key]
      return value !== undefined ? String(value) : `[Missing value for ${key}]`
    })
  }

  // Add display names to memoized components
  ToolHeader.displayName = "ToolHeader"
  ErrorAlert.displayName = "ErrorAlert"
  ResultsErrorAlert.displayName = "ResultsErrorAlert"

  return (
    <div className="space-y-6">
      <ToolHeader tool={tool} />

      {error && !results?.errorMessage && (
        <ErrorAlert errorMessage={error} />
      )}
      
      {results?.errorMessage && (
        <ResultsErrorAlert status={results.status} errorMessage={results.errorMessage} />
      )}

      <div className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {tool.inputFields.map((field: SelectToolInputField) => (
                <FormField
                  key={field.id}
                  control={form.control}
                  name={field.name}
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>{field.label || field.name}</FormLabel>
                      <FormControl>
                        {field.fieldType === "long_text" ? (
                        <Textarea
                          placeholder="Enter your answer..."
                          {...formField}
                          value={formField.value ?? ""}
                          className="bg-muted"
                        />
                        ) : field.fieldType === "select" || field.fieldType === "multi_select" ? (
                          <Select onValueChange={formField.onChange} defaultValue={formField.value ?? undefined}>
                            <SelectTrigger className="bg-muted">
                              <SelectValue placeholder={`Select ${field.label || field.name}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                let options: Array<{ label: string, value: string }> = []
                                if (typeof field.options === "string") {
                                  try {
                                    const parsed = JSON.parse(field.options)
                                    if (Array.isArray(parsed)) {
                                      options = parsed
                                    }
                                  } catch {
                                    options = field.options.split(",").map(s => ({
                                      value: s.trim(),
                                      label: s.trim()
                                    }))
                                  }
                                } else if (Array.isArray(field.options)) {
                                  options = field.options
                                }
                                return options.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))
                              })()}
                            </SelectContent>
                          </Select>
                        ) : field.fieldType === "file_upload" ? (
                          <PdfUploadButton
                            label="Upload PDF"
                            onMarkdown={doc => formField.onChange(doc)}
                            disabled={isLoading}
                            className="w-full"
                          />
                        ) : (
                        <Input
                          placeholder="Enter your answer..."
                          {...formField}
                          value={formField.value ?? ""}
                          className="bg-muted"
                        />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                  ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate</>
                  )}
                </Button>
                {isLoading && isStreaming && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      stop()
                      setIsLoading(false)
                      setCurrentPromptIndex(-1)
                      toast({ 
                        title: "Execution Cancelled", 
                        description: "The execution has been stopped" 
                      })
                    }}
                  >
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                )}
              </div>
          </form>
        </Form>
      </div>

      {(isLoading || results) && (
        <div className="border rounded-lg p-4 space-y-4 max-w-full">
          <div className="flex items-center justify-between">
            {results && (
              <div className={`text-sm font-medium ${results.status === 'completed' ? 'text-green-600' : results.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}`}>
                Status: {results.status}
              </div>
            )}
            {isLoading && !results && (
              <div className="text-sm text-muted-foreground">
                Waiting for results...
              </div>
            )}
          </div>

          <ErrorBoundary>
            <div className="space-y-6">
              {isLoading && !results && (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {results?.promptResults && results.promptResults.length > 0 ? (
                <div className="space-y-6">
                  {results.promptResults.map((promptResult: ExtendedPromptResult, index: number) => (
                    <div key={promptResult.id} className="space-y-3 p-4 border rounded-md bg-card shadow-sm">
                      <button
                        onClick={() => togglePromptExpand(String(promptResult.id))}
                        className="w-full flex items-center justify-between text-sm font-medium mb-2"
                      >
                        <div className="flex items-center text-muted-foreground">
                          <Terminal className="h-4 w-4 mr-2" />
                          <span className="font-semibold text-foreground">Prompt {index + 1} - {tool.prompts?.find(p => p.id === promptResult.promptId)?.name || 'Unnamed'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentPromptIndex === index && isStreaming && (
                            <div className="flex items-center gap-2">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                              </div>
                              <span className="text-xs text-muted-foreground">Streaming...</span>
                            </div>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            promptResult.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                            : promptResult.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                            : promptResult.status === "running" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                            : "bg-muted text-muted-foreground"
                          }`}>
                            {promptResult.status}
                            {promptResult.executionTimeMs ? ` (${(promptResult.executionTimeMs / 1000).toFixed(1)}s)` : ''}
                          </span>
                          {expandedPrompts[String(promptResult.id)] ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {expandedPrompts[String(promptResult.id)] && (
                        <>
                          {promptResult.inputData && (
                            <div className="border border-border/50 rounded-md overflow-hidden">
                              <button
                                onClick={() => toggleInputExpand(String(promptResult.id))}
                                className="w-full px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors flex items-center justify-between text-xs font-medium text-foreground"
                              >
                                <div className="flex items-center">
                                  <User className="h-3 w-3 mr-1.5 flex-shrink-0 text-blue-500"/>
                                  Input Data Used
                                </div>
                                {expandedInputs[String(promptResult.id)] ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              {expandedInputs[String(promptResult.id)] && (
                                <div className="p-3 bg-muted/20 space-y-4">
                                  <div>
                                    <div className="font-semibold text-xs mb-1">Input Data</div>
                                    <pre className="text-xs whitespace-pre-wrap break-all font-mono text-muted-foreground">
                                      {JSON.stringify(promptResult.inputData, null, 2)}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-xs mb-1">Processed Prompt</div>
                                    <pre className="text-xs whitespace-pre-wrap break-all font-mono text-muted-foreground">
                                      {(() => {
                                        const { template } = getPromptTemplateAndContext(promptResult.promptId)
                                        return substitutePromptVariables(template, promptResult.inputData || {})
                                      })()}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-xs mb-1">System Context</div>
                                    <pre className="text-xs whitespace-pre-wrap break-all font-mono text-muted-foreground">
                                      {(() => {
                                        const { context } = getPromptTemplateAndContext(promptResult.promptId)
                                        return context || ''
                                      })()}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {(promptResult.outputData || (currentPromptIndex === index && completion)) && (
                            <div className="mt-3 border border-border/50 rounded-md overflow-hidden">
                              <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                                <div className="flex items-center text-xs font-medium text-foreground">
                                  <Bot className="h-3.5 w-3.5 mr-1.5 flex-shrink-0 text-green-500"/>
                                  Output
                                </div>
                              </div>
                              <div className="p-4 bg-background">
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                  <style jsx global>{`
                                    /* General Markdown Output Area */
                                    .markdown-output {
                                      line-height: 1.6; /* Slightly more spacious line height */
                                      font-size: 0.95rem; /* Slightly larger base font */
                                      color: var(--foreground);
                                      overflow-wrap: break-word;
                                      word-break: break-word; /* Ensure long words break */
                                    }

                                    /* Headings - Clear hierarchy, balanced spacing */
                                    .markdown-output h1,
                                    .markdown-output h2,
                                    .markdown-output h3,
                                    .markdown-output h4,
                                    .markdown-output h5,
                                    .markdown-output h6 {
                                      font-weight: 600;
                                      color: var(--foreground);
                                      margin-top: 1.75em; /* More space above headings */
                                      margin-bottom: 0.75em; /* Less space below headings */
                                      line-height: 1.3;
                                    }
                                    .markdown-output h1 { /* Mapped to h2 by component override */
                                      font-size: 1.3em; /* Larger */
                                      padding-bottom: 0.3em;
                                      border-bottom: 1px solid var(--border);
                                    }
                                    .markdown-output h2 { /* Mapped to h3 */
                                      font-size: 1.15em;
                                    }
                                    .markdown-output h3 { /* Mapped to h4 */
                                      font-size: 1.05em;
                                    }
                                    /* Prevent excessive top margin for the very first element */
                                    .markdown-output > *:first-child {
                                      margin-top: 0;
                                    }

                                    /* Paragraphs - Standard spacing */
                                    .markdown-output p {
                                      margin-top: 0.6em;
                                      margin-bottom: 0.6em;
                                    }

                                    /* Lists - Proper indentation and spacing */
                                    .markdown-output ul,
                                    .markdown-output ol {
                                      margin-top: 0.6em;
                                      margin-bottom: 0.6em;
                                      padding-left: 1.75em; /* Standard indentation */
                                    }
                                    .markdown-output li {
                                      margin-top: 0.25em;
                                      margin-bottom: 0.25em;
                                    }
                                    .markdown-output ul { list-style-type: disc; }
                                    .markdown-output ol { list-style-type: decimal; }
                                    .markdown-output li > p { margin-top: 0.25em; margin-bottom: 0.25em; } /* Tighter spacing for paragraphs within list items */
                                    .markdown-output li > ul,
                                    .markdown-output li > ol {
                                      margin-top: 0.25em;
                                      margin-bottom: 0.25em;
                                    }

                                    /* Other elements */
                                    .markdown-output strong { font-weight: 600; }
                                    .markdown-output blockquote {
                                      border-left: 3px solid var(--border); /* Slightly thicker border */
                                      padding-left: 1em;
                                      margin-top: 1em;
                                      margin-bottom: 1em;
                                      color: var(--muted-foreground);
                                      font-style: italic;
                                    }
                                    .markdown-output pre, .markdown-output code:not(pre code) {
                                      max-width: 100%;
                                      white-space: pre-wrap;
                                      word-wrap: break-word;
                                      overflow-wrap: break-word;
                                    }
                                    .markdown-output code:not(pre code) {
                                      background-color: var(--muted);
                                      padding: 0.2em 0.4em;
                                      border-radius: 3px;
                                      font-size: 0.9em;
                                    }
                                  `}</style>
                                  <div className="markdown-output">
                                    <ReactMarkdown
                                      components={{
                                      h1: (props) => <h2 {...props} />,
                                      h2: (props) => <h3 {...props} />,
                                      h3: (props) => <h4 {...props} />,
                                    }}
                                  >
                                    {currentPromptIndex === index && completion ? completion : promptResult.outputData || ""}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 justify-end mt-4">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Copy output"
                                    onClick={() => copyToClipboard(
                                      currentPromptIndex === index && completion ? completion : promptResult.outputData || ""
                                    )}
                                  >
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                                    <span className="sr-only">Copy output</span>
                                  </Button>
                                  <Button
                                    variant={promptResult.userFeedback === 'like' ? 'success' : 'ghost'}
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Like output"
                                    onClick={async () => await handleFeedback(promptResult, 'like')}
                                  >
                                    <ThumbsUp className={`h-3.5 w-3.5 ${promptResult.userFeedback === 'like' ? 'text-green-500' : 'text-muted-foreground'} transition-colors`} />
                                    <span className="sr-only">Like output</span>
                                  </Button>
                                  <Button
                                    variant={promptResult.userFeedback === 'dislike' ? 'error' : 'ghost'}
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Dislike output"
                                    onClick={async () => await handleFeedback(promptResult, 'dislike')}
                                  >
                                    <ThumbsDown className={`h-3.5 w-3.5 ${promptResult.userFeedback === 'dislike' ? 'text-red-500' : 'text-muted-foreground'} transition-colors`} />
                                    <span className="sr-only">Dislike output</span>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {(results.status === "completed" || conversationId !== null) && (
                    <div className="mt-8">
                      <ChatErrorBoundary>
                        <AssistantArchitectChat
                          execution={results as unknown as ExecutionResultDetails}
                          conversationId={conversationId}
                          onConversationCreated={setConversationId}
                          isPreview={isPreview}
                          modelId={tool?.prompts?.[0]?.modelId}
                        />
                      </ChatErrorBoundary>
                    </div>
                  )}
                </div>
              ) : (
                 results && !isLoading && <p className="text-sm text-muted-foreground text-center py-4">No prompt results were generated.</p>
              )}
            </div>
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
});