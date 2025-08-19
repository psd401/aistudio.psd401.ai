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
import { Loader2, Bot, Terminal, AlertCircle, ChevronDown, ChevronRight, Copy, ThumbsUp, ThumbsDown, Sparkles, X } from "lucide-react"
import { MemoizedMarkdown } from "@/components/ui/memoized-markdown"
import { ErrorBoundary } from "@/components/error-boundary"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AssistantArchitectChat } from "./assistant-architect-chat"
import { ChatErrorBoundary } from "./chat-error-boundary"
import Image from "next/image"
import PdfUploadButton from "@/components/ui/pdf-upload-button"
import { updatePromptResultAction } from "@/actions/db/assistant-architect-actions"
import { useChat } from '@ai-sdk/react'
import { nanoid } from 'nanoid'

const generateRequestId = () => nanoid()

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
  const [isPolling, setIsPolling] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<ExtendedExecutionResultDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [executionId, setExecutionId] = useState<number | null>(null)

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

  // Use AI SDK's useChat hook - exactly like /chat and model-compare do
  const { 
    messages,
    sendMessage,
    status,
    stop,
    setMessages
  } = useChat({
    onFinish: () => {
      // Update results when streaming is complete
      if (executionId) {
        setResults(prev => {
          if (!prev) return null
          return {
            ...prev,
            status: 'completed',
            completedAt: new Date(),
            // For streaming display, we don't need promptResults since we're using messages directly
            promptResults: []
          }
        })
      }
      
      toast({
        title: "Execution Completed",
        description: "Assistant response completed successfully"
      })
    },
    onError: (error) => {
      setError(error.message)
      toast({
        title: "Execution Error",
        description: error.message,
        variant: "destructive"
      })
    }
  })

  const onSubmit = useCallback(async (values: z.infer<typeof formSchema>) => {
    // Only clear results if we're not already processing
    if (status !== 'streaming' && status !== 'submitted' && !isPolling) {
      // Don't clear results if we already have completed results - user might be using chat
      if (!results || results.status !== 'completed') {
        setResults(null)
        setError(null)
      } else {
        // If we have completed results, confirm before re-running
        const confirmRerun = window.confirm("You have existing results. Do you want to run the assistant again? This will clear your current results and chat.")
        if (!confirmRerun) {
          return;
        }
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
          
          // Initialize results structure for streaming
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
            promptResults: [] // Will be populated by streaming
          }
          setResults(initialResults)
          
          // Clear previous messages
          setMessages([])
          
          // Use the model ID returned from the action
          const modelIdentifier = (result.data as { modelId?: string })?.modelId;
          
          if (!modelIdentifier) {
            setError('No model configured for this tool');
            return;
          }
          
          // Start streaming using AI SDK's useChat - exactly like /chat does
          await sendMessage({
            id: generateRequestId(),
            role: 'user' as const,
            parts: [{ type: 'text' as const, text: JSON.stringify(values) }]
          }, {
            body: {
              modelId: modelIdentifier,
              executionId: result.data.executionId,
              source: 'assistant_execution'
            }
          })
          
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
      }
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "Failed to start execution"
      setError(errorMessage)
      toast({
        title: "Execution Error",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }, [status, isPolling, tool.id, results, toast, sendMessage, setMessages])

  // Helper to parse JSON safely for legacy polling
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

  // Legacy polling for old executions without streaming support
  useEffect(() => {
    if (!isPolling) return // Exit early if not polling
    
    const abortController = new AbortController()
    let intervalId: NodeJS.Timeout | null = null
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
              if (promptResultsForState.length > 0) {
                const lastPromptId = promptResultsForState[promptResultsForState.length - 1].id;
                const newExpandedPrompts = promptResultsForState.reduce((acc, prompt) => {
                  acc[prompt.id] = prompt.id === lastPromptId;
                  return acc;
                }, {} as Record<string, boolean>);
                setExpandedPrompts(newExpandedPrompts);
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
      // Cleanup polling on unmount
      abortController.abort() // Cancel any pending operations
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isPolling, jobId, tool.id, toast, form, results, safeJsonParse])

  const togglePromptExpand = useCallback((promptResultId: string) => {
    setExpandedPrompts(prev => ({
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
                            disabled={status === 'streaming' || status === 'submitted'}
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
                <Button type="submit" disabled={status === 'streaming' || status === 'submitted' || isPolling}>
                  {(status === 'streaming' || status === 'submitted' || isPolling) ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                  ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate</>
                  )}
                </Button>
                {(status === 'streaming' || status === 'submitted') && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      stop()
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

      {(status === 'streaming' || status === 'submitted' || results || messages.length > 0) && (
        <div className="border rounded-lg p-4 space-y-4 max-w-full">
          <div className="flex items-center justify-between">
            <div className={`text-sm font-medium ${
              status === 'streaming' || status === 'submitted' ? 'text-blue-600' : 
              results?.status === 'completed' || messages.some(m => m.role === 'assistant') ? 'text-green-600' : 
              results?.status === 'failed' || error ? 'text-red-600' : 
              'text-muted-foreground'
            }`}>
              Status: {
                status === 'streaming' ? 'Streaming response...' :
                status === 'submitted' ? 'Processing...' :
                results?.status === 'completed' || messages.some(m => m.role === 'assistant') ? 'Completed' :
                results?.status === 'failed' ? 'Failed' :
                error ? 'Error' :
                'Ready'
              }
            </div>
            {(status === 'streaming' || status === 'submitted') && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>

          <ErrorBoundary>
            <div className="space-y-6">
              {/* Show streaming messages directly from useChat */}
              {(status === 'streaming' || status === 'submitted' || messages.length > 0) && (
                <div className="space-y-3 p-4 border rounded-md bg-card shadow-sm">
                  <div className="flex items-center justify-between text-sm font-medium mb-2">
                    <div className="flex items-center text-muted-foreground">
                      <Terminal className="h-4 w-4 mr-2" />
                      <span className="font-semibold text-foreground">AI Response</span>
                    </div>
                    {(status === 'streaming' || status === 'submitted') && (
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">Streaming...</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 border border-border/50 rounded-md overflow-hidden">
                    <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                      <div className="flex items-center text-xs font-medium text-foreground">
                        <Bot className="h-3.5 w-3.5 mr-1.5 flex-shrink-0 text-green-500"/>
                        Output
                      </div>
                    </div>
                    <div className="p-4 bg-background">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <div className="markdown-output">
                          <MemoizedMarkdown 
                            id={`streaming-${executionId || 'unknown'}`}
                            content={(() => {
                            const assistantMsg = messages.find(m => m.role === 'assistant');
                            if (!assistantMsg) return "Waiting for response...";
                            // Handle AI SDK v2 message format
                            if ('parts' in assistantMsg && Array.isArray(assistantMsg.parts)) {
                              return assistantMsg.parts
                                .filter(part => part.type === 'text')
                                .map(part => part.text || '')
                                .join('');
                            }
                            // Fallback to content if available
                            return (assistantMsg as { content?: string }).content || "Waiting for response...";
                          })()} />
                        </div>
                      </div>
                      {messages.find(m => m.role === 'assistant') && (
                        <div className="flex items-center gap-2 justify-end mt-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Copy output"
                            onClick={() => {
                              const assistantMsg = messages.find(m => m.role === 'assistant');
                              let content = "";
                              if (assistantMsg) {
                                if ('parts' in assistantMsg && Array.isArray(assistantMsg.parts)) {
                                  content = assistantMsg.parts
                                    .filter(part => part.type === 'text')
                                    .map(part => part.text || '')
                                    .join('');
                                } else {
                                  content = (assistantMsg as { content?: string }).content || "";
                                }
                              }
                              copyToClipboard(content);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                            <span className="sr-only">Copy output</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Show final results when available from polling */}
              {results?.promptResults && results.promptResults.length > 0 && status !== 'streaming' && status !== 'submitted' && (
                <div className="space-y-6">
                  {results.promptResults.map((promptResult: ExtendedPromptResult, index: number) => (
                    <div key={promptResult.id} className="space-y-3 p-4 border rounded-md bg-card shadow-sm">
                      <button
                        onClick={() => togglePromptExpand(String(promptResult.id))}
                        className="w-full flex items-center justify-between text-sm font-medium mb-2"
                      >
                        <div className="flex items-center text-muted-foreground">
                          <Terminal className="h-4 w-4 mr-2" />
                          <span className="font-semibold text-foreground">Prompt {index + 1} - {tool.prompts?.find(p => p.id === promptResult.promptId)?.name || 'Results'}</span>
                        </div>
                        <div className="flex items-center gap-2">
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

                      {expandedPrompts[String(promptResult.id)] && promptResult.outputData && (
                        <div className="mt-3 border border-border/50 rounded-md overflow-hidden">
                          <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                            <div className="flex items-center text-xs font-medium text-foreground">
                              <Bot className="h-3.5 w-3.5 mr-1.5 flex-shrink-0 text-green-500"/>
                              Output
                            </div>
                          </div>
                          <div className="p-4 bg-background">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <div className="markdown-output">
                                <MemoizedMarkdown 
                                  id={`result-${promptResult.id}`}
                                  content={promptResult.outputData || ""} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end mt-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Copy output"
                                onClick={() => copyToClipboard(promptResult.outputData || "")}
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
                    </div>
                  ))}
                </div>
              )}
              
              {/* Chat section for completed executions */}
              {(results?.status === "completed" || conversationId !== null) && (
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
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
});