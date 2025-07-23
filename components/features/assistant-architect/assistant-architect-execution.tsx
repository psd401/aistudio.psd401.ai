"use client"

// Constants
const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout for streaming

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
import ErrorBoundary from "@/components/utilities/error-boundary"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AssistantArchitectChat } from "./assistant-architect-chat"
import type { SelectPromptResult } from "@/types/db-types"
import Image from "next/image"
import PdfUploadButton from "@/components/ui/pdf-upload-button"
import { updatePromptResultAction } from "@/actions/db/assistant-architect-actions"

interface AssistantArchitectExecutionProps {
  tool: AssistantArchitectWithRelations
  isPreview?: boolean
}

export const AssistantArchitectExecution = memo(function AssistantArchitectExecution({ tool, isPreview = false }: AssistantArchitectExecutionProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<ExecutionResultDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({})
  const [conversationId, setConversationId] = useState<number | null>(null)

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

  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [streamingPromptIndex, setStreamingPromptIndex] = useState<number>(-1)
  const [promptTexts, setPromptTexts] = useState<Record<string, string>>({})


  const handleStreamEvent = useCallback((event: { type: string; totalPrompts?: number; promptIndex?: number; promptId?: number; modelName?: string; token?: string; result?: string; error?: string; executionId?: number; message?: string }, inputs: Record<string, unknown>) => {
    switch (event.type) {
      case 'metadata':
        // Initialize results structure
        const initialResults: ExecutionResultDetails = {
          id: jobId || 'streaming',
          toolId: tool.id,
          userId: 'current',
          status: 'running',
          inputData: inputs,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null,
          promptResults: Array(event.totalPrompts).fill(null).map((_, i) => ({
            id: `prompt_${i}_temp`,
            executionId: jobId || 'streaming',
            promptId: i, // Use index temporarily, will be updated by prompt_start
            inputData: '',
            outputData: '',
            status: 'pending' as const,
            startedAt: new Date(),
            completedAt: null,
            executionTimeMs: null,
            errorMessage: null
          }))
        }
        setResults(initialResults)
        break

      case 'prompt_start':
        setStreamingPromptIndex(event.promptIndex)
        // Initialize with a waiting message
        setPromptTexts(prev => ({
          ...prev,
          [event.promptIndex]: 'Waiting for AI response...'
        }))
        setResults(prev => {
          if (!prev) return null
          const updated = { ...prev }
          updated.promptResults[event.promptIndex] = {
            ...updated.promptResults[event.promptIndex],
            promptId: event.promptId || updated.promptResults[event.promptIndex].promptId,
            status: 'running' as const,
            startedAt: new Date()
          }
          return updated
        })
        // Auto-expand the currently streaming prompt
        const promptId = `prompt_${event.promptIndex}_temp`
        setExpandedPrompts(prev => ({ ...prev, [promptId]: true }))
        break

      case 'token':
        setPromptTexts(prev => {
          // If this is the first token, clear the waiting message
          const currentText = prev[event.promptIndex] || ''
          const isWaitingMessage = currentText === 'Waiting for AI response...'
          
          const updated = {
            ...prev,
            [event.promptIndex]: isWaitingMessage ? event.token : currentText + event.token
          }
          return updated
        })
        break

      case 'prompt_complete':
        // Clear the streaming text for this prompt
        setPromptTexts(prev => {
          const updated = { ...prev }
          delete updated[event.promptIndex]
          return updated
        })
        // Update results with the final output
        setResults(prev => {
          if (!prev) return null
          const updated = { ...prev }
          updated.promptResults[event.promptIndex] = {
            ...updated.promptResults[event.promptIndex],
            status: 'completed' as const,
            completedAt: new Date(),
            outputData: event.result,
            executionTimeMs: Date.now() - updated.promptResults[event.promptIndex].startedAt.getTime()
          }
          return updated
        })
        break

      case 'prompt_error':
        setResults(prev => {
          if (!prev) return null
          const updated = { ...prev }
          updated.promptResults[event.promptIndex] = {
            ...updated.promptResults[event.promptIndex],
            status: 'failed' as const,
            completedAt: new Date(),
            errorMessage: event.error
          }
          return updated
        })
        break

      case 'complete':
        setIsLoading(false)
        setStreamingPromptIndex(-1)
        setPromptTexts({}) // Clear all streaming texts
        setResults(prev => {
          if (!prev) return null
          return {
            ...prev,
            status: 'completed',
            completedAt: new Date()
          }
        })
        toast({
          title: "Execution Completed",
          description: "All prompts have been executed successfully"
        })
        break

      case 'status':
        // Update the prompt text with status message
        if (event.promptIndex !== undefined) {
          setPromptTexts(prev => ({
            ...prev,
            [event.promptIndex]: event.message || 'Processing...'
          }))
        }
        break

      case 'error':
        setIsLoading(false)
        setStreamingPromptIndex(-1)
        setPromptTexts({}) // Clear all streaming texts
        setError(event.error)
        setResults(prev => {
          if (!prev) return null
          return {
            ...prev,
            status: 'failed',
            completedAt: new Date(),
            errorMessage: event.error
          }
        })
        toast({
          title: "Execution Error",
          description: event.error,
          variant: "destructive"
        })
        break
    }
  }, [jobId, tool.id, toast])

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
        
        if (supportsStreaming) {
          // Start streaming
          const controller = new AbortController()
          setAbortController(controller)
          setPromptTexts({})
          
          try {
            const response = await fetch('/api/assistant-architect/stream', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                toolId: tool.id,
                executionId: result.data.executionId,
                inputs: values
              }),
              signal: controller.signal
            })

            if (!response.ok) {
              throw new Error(`Streaming failed: ${response.statusText}`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
              throw new Error('No reader available')
            }

            // Don't store reader - it causes issues

            // Set up timeout
            const timeoutId = setTimeout(() => {
              controller.abort()
              toast({
                title: "Stream Timeout",
                description: "The streaming operation took too long and was cancelled.",
                variant: "destructive"
              })
            }, STREAM_TIMEOUT_MS)

            try {
              // Process the stream
              let buffer = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6))
                      handleStreamEvent(data, values)
                    } catch (parseError) {
                      // Log parse errors for debugging but don't break the stream
                      if (process.env.NODE_ENV === 'development') {
                      }
                    }
                  }
                }
              }
            } finally {
              // Clear timeout on completion or error
              clearTimeout(timeoutId)
            }
            
            // Clean up reader after successful streaming
            reader.releaseLock()
          } catch (streamError) {
            if (streamError instanceof Error && streamError.name === 'AbortError') {
              // Stream aborted
              return
            }
            // Fall back to polling for this execution
            setIsPolling(true)
          } finally {
            // Clean up resources
            setAbortController(null)
          }
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
  }, [isLoading, isPolling, setIsLoading, setResults, setError, tool.id, toast, results, setConversationId, handleStreamEvent])

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
    let intervalId: NodeJS.Timeout | null = null
    let retryCount = 0
    const MAX_RETRIES = 120
    const BACKOFF_THRESHOLD = 20
    let currentInterval = 3000
    let isMounted = true // Flag to track if the component is still mounted

    async function pollJob() {
      if (!jobId || !isMounted) return
      
      try {
        const result = await getJobAction(jobId)
        // Check if component is still mounted before updating state
        if (!isMounted) return
        retryCount++

        if (result.isSuccess && result.data) {
          const job = result.data as SelectJob

          if (job.status === "completed" || job.status === "failed") {
            setIsLoading(false)
            setIsPolling(false)

            const jobError = job.error || (job.status === "failed" ? "Execution failed without a specific error message" : null);
            if (jobError) {
              setError(jobError)
            }

            const outputData = safeJsonParse(job.output) as JobOutput | null;
            const inputData = safeJsonParse(job.input);

            if (outputData) {
              const promptResultsForState = outputData.results.map((res: JobPromptResult) => ({
                id: res.promptId + "_" + outputData.executionId,
                executionId: outputData.executionId,
                promptId: res.promptId,
                inputData: res.input,
                outputData: res.output,
                status: res.status as "pending" | "completed" | "failed",
                startedAt: new Date(res.startTime),
                completedAt: res.endTime ? new Date(res.endTime) : null,
                executionTimeMs: res.executionTimeMs,
                errorMessage: res.status === 'failed' ? 'Prompt execution failed' : null
              })) as SelectPromptResult[];

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
                toolId: tool.id,
                userId: job.userId,
                status: job.status,
                inputData: inputData,
                startedAt: new Date(job.createdAt),
                completedAt: new Date(job.updatedAt),
                errorMessage: jobError,
                promptResults: promptResultsForState
              })
            } else if (job.status === 'failed') {
              setResults({
                id: jobId,
                toolId: tool.id,
                userId: job.userId,
                status: job.status,
                inputData: inputData,
                startedAt: new Date(job.createdAt),
                completedAt: new Date(job.updatedAt),
                errorMessage: jobError || "Execution failed, and output data was not available.",
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
      } catch (pollError) {
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
                 toolId: tool.id,
                 userId: 'unknown',
                 status: 'failed',
                 inputData,
                 startedAt: new Date(),
                 completedAt: new Date(),
                 errorMessage: timeoutError,
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
           intervalId = setInterval(pollJob, currentInterval)
         }
       }
    }

    if (isPolling) {
      pollJob();
      intervalId = setInterval(pollJob, currentInterval)
    }

    return () => {
      isMounted = false; // Mark as unmounted
      if (intervalId) {
        clearInterval(intervalId);
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
    } catch (copyError) {
      toast({
        description: "Failed to copy to clipboard",
        variant: "destructive"
      })
    }
  }, [toast])

  const handleFeedback = async (promptResult, feedback) => {
    try {
      await updatePromptResultAction(promptResult.executionId, promptResult.promptId, { userFeedback: feedback })
      setResults(prev => {
        if (!prev) return prev
        return {
          ...prev,
          promptResults: prev.promptResults.map(pr =>
            pr.id === promptResult.id ? { ...pr, userFeedback: feedback } : pr
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
  function getPromptTemplateAndContext(promptId: string) {
    const prompt = tool.prompts?.find(p => p.id === promptId)
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
                {isLoading && abortController && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      abortController.abort()
                      setAbortController(null)
                      setIsLoading(false)
                      setStreamingPromptIndex(-1)
                      setPromptTexts({})
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

          <ErrorBoundary fallbackMessage="Failed to render execution results.">
            <div className="space-y-6">
              {isLoading && !results && (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {results?.promptResults && results.promptResults.length > 0 ? (
                <div className="space-y-6">
                  {results.promptResults.map((promptResult: SelectPromptResult, index: number) => (
                    <div key={promptResult.id} className="space-y-3 p-4 border rounded-md bg-card shadow-sm">
                      <button
                        onClick={() => togglePromptExpand(promptResult.id)}
                        className="w-full flex items-center justify-between text-sm font-medium mb-2"
                      >
                        <div className="flex items-center text-muted-foreground">
                          <Terminal className="h-4 w-4 mr-2" />
                          <span className="font-semibold text-foreground">Prompt {index + 1} - {tool.prompts?.find(p => p.id === promptResult.promptId)?.name || 'Unnamed'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {streamingPromptIndex === index && (
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
                          {expandedPrompts[promptResult.id] ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {expandedPrompts[promptResult.id] && (
                        <>
                          {promptResult.inputData && (
                            <div className="border border-border/50 rounded-md overflow-hidden">
                              <button
                                onClick={() => toggleInputExpand(promptResult.id)}
                                className="w-full px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors flex items-center justify-between text-xs font-medium text-foreground"
                              >
                                <div className="flex items-center">
                                  <User className="h-3 w-3 mr-1.5 flex-shrink-0 text-blue-500"/>
                                  Input Data Used
                                </div>
                                {expandedInputs[promptResult.id] ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              {expandedInputs[promptResult.id] && (
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

                          {(promptResult.outputData || promptTexts[index] || (streamingPromptIndex === index)) && (
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
                                  <ReactMarkdown
                                    className="markdown-output"
                                    components={{
                                      h1: (props) => <h2 {...props} />,
                                      h2: (props) => <h3 {...props} />,
                                      h3: (props) => <h4 {...props} />,
                                    }}
                                  >
                                    {promptTexts[index] || promptResult.outputData || ""}
                                  </ReactMarkdown>
                                </div>
                                <div className="flex items-center gap-2 justify-end mt-4">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Copy output"
                                    onClick={() => copyToClipboard(
                                      promptTexts[index] || promptResult.outputData || ""
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
                  {results.status === "completed" && (
                    <div className="mt-8">
                      <AssistantArchitectChat
                        execution={results}
                        conversationId={conversationId}
                        onConversationCreated={setConversationId}
                        isPreview={isPreview}
                      />
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