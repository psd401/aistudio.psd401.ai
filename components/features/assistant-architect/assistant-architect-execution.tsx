"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { getStreamingJobAction, cancelStreamingJobAction } from "@/actions/db/streaming-job-actions"
import { SelectJob, SelectToolInputField } from "@/types/db-types"
import { ExecutionResultDetails } from "@/types/assistant-architect-types"
import { Loader2, Bot, Terminal, AlertCircle, ChevronDown, ChevronRight, Copy, ThumbsUp, ThumbsDown, Sparkles, X, Settings } from "lucide-react"
import { MemoizedMarkdown } from "@/components/ui/memoized-markdown"
import { ErrorBoundary } from "@/components/error-boundary"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { collectAndSanitizeEnabledTools, getToolDisplayName } from '@/lib/assistant-architect/tool-utils'
import { AssistantArchitectChat } from "./assistant-architect-chat"
import { ChatErrorBoundary } from "./chat-error-boundary"
import { ScheduleModal } from "./schedule-modal"
import Image from "next/image"
import DocumentUploadButton from "@/components/ui/document-upload-button"
import { updatePromptResultAction } from "@/actions/db/assistant-architect-actions"
import { type StreamingJob } from "@/lib/streaming/job-management-service"

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
  enabledTools?: string[] // Add enabled tools to track tool usage
}


export const AssistantArchitectExecution = memo(function AssistantArchitectExecution({ tool, isPreview = false }: AssistantArchitectExecutionProps) {
  const { toast } = useToast()
  const [isPolling, setIsPolling] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [streamingJob, setStreamingJob] = useState<StreamingJob | null>(null)
  const [results, setResults] = useState<ExtendedExecutionResultDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [executionId, setExecutionId] = useState<number | null>(null)
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled'>('pending')
  const [partialContent, setPartialContent] = useState<string>('')
  const [enabledTools, setEnabledTools] = useState<string[]>([])

  // Collect enabled tools from the assistant architect when component mounts
  useEffect(() => {
    const tools = tool.prompts ? collectAndSanitizeEnabledTools(tool.prompts) : [];
    setEnabledTools(tools);
  }, [tool]);

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

  // Universal Polling Architecture - No local streaming, all via job polling

  const onSubmit = useCallback(async (values: z.infer<typeof formSchema>) => {
    // Only clear results if we're not already processing
    if (jobStatus !== 'streaming' && jobStatus !== 'processing' && !isPolling) {
      // Don't clear results if we already have completed results - user might be using chat
      if (!results || results.status !== 'completed') {
        setResults(null)
        setError(null)
        setPartialContent('')
        setStreamingJob(null)
      } else {
        // If we have completed results, confirm before re-running
        const confirmRerun = window.confirm("You have existing results. Do you want to run the assistant again? This will clear your current results and chat.")
        if (!confirmRerun) {
          return;
        }
        setResults(null)
        setError(null)
        setPartialContent('')
        setStreamingJob(null)
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
        setExecutionId(result.data.executionId || null)
        setJobStatus('pending')
        setIsPolling(true)
        
        // Initialize results structure for job tracking
        const initialResults: ExtendedExecutionResultDetails = {
          id: result.data.executionId || result.data.jobId,
          toolId: tool.id,
          userId: 'current',
          status: 'running',
          inputData: values,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null,
          assistantArchitectId: tool.id,
          promptResults: [], // Will be populated by polling
          enabledTools: enabledTools
        }
        setResults(initialResults)
        
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
  }, [jobStatus, isPolling, tool.id, results, toast, enabledTools])


  // Universal Polling Architecture - Poll streaming job status
  useEffect(() => {
    if (!isPolling || !jobId) return
    
    const abortController = new AbortController()
    let intervalId: NodeJS.Timeout | null = null
    let retryCount = 0
    const MAX_RETRIES = 120

    async function pollStreamingJob() {
      if (!jobId || abortController.signal.aborted) return
      
      try {
        // Try to get streaming job first (for new assistant architect executions)
        const streamingJobResult = await getStreamingJobAction(jobId)
        let job: StreamingJob | null = null
        
        if (streamingJobResult.isSuccess && streamingJobResult.data) {
          // Use the streaming job data
          job = streamingJobResult.data
        } else {
          // Fall back to legacy job structure for backward compatibility
          const legacyJobResult = await getJobAction(jobId)
          if (!legacyJobResult.isSuccess) {
            retryCount++
            return
          }
          
          // Convert legacy job to streaming job format
          const legacyJob = legacyJobResult.data as SelectJob
          job = {
            id: jobId,
            conversationId: String(legacyJob.id),
            userId: legacyJob.userId,
            modelId: 1, // Default model ID
            status: legacyJob.status === 'pending' ? 'pending' : 
                   legacyJob.status === 'running' ? 'processing' :
                   legacyJob.status === 'completed' ? 'completed' : 'failed',
            requestData: { messages: [], modelId: '', provider: '' },
            partialContent: undefined, // Legacy jobs don't have partial content
            responseData: legacyJob.output ? {
              text: legacyJob.output,
              finishReason: 'stop'
            } : undefined,
            errorMessage: legacyJob.error || undefined,
            createdAt: new Date(legacyJob.createdAt),
            completedAt: legacyJob.updatedAt ? new Date(legacyJob.updatedAt) : undefined
          }
        }
        
        if (abortController.signal.aborted) return
        retryCount++

        if (job) {
          setStreamingJob(job)
          setJobStatus(job.status)
          
          // Update partial content if available
          if (job.partialContent) {
            setPartialContent(job.partialContent)
          }

          // Handle completed or failed jobs
          if (job.status === 'completed' || job.status === 'failed') {
            setIsPolling(false)

            // For completed jobs with response data, create final results
            if (job.status === 'completed' && job.responseData) {
              const finalResults: ExtendedExecutionResultDetails = {
                id: executionId || job.id,
                toolId: tool.id,
                userId: job.userId,
                status: 'completed',
                inputData: results?.inputData || {},
                startedAt: job.createdAt,
                completedAt: job.completedAt || new Date(),
                errorMessage: null,
                assistantArchitectId: tool.id,
                promptResults: [], // Assistant architect jobs don't use traditional prompt results
                enabledTools: enabledTools
              }
              setResults(finalResults)
              
              toast({
                title: "Execution Completed",
                description: "Assistant architect execution completed successfully"
              })
            } else if (job.status === 'failed') {
              const errorMessage = job.errorMessage || "Execution failed"
              setError(errorMessage)
              
              setResults(prev => prev ? {
                ...prev,
                status: 'failed',
                errorMessage,
                completedAt: job.completedAt || new Date()
              } : null)

              toast({
                title: "Execution Failed",
                description: errorMessage,
                variant: "destructive"
              })
            }

            if (intervalId) {
              clearInterval(intervalId)
            }
          }
        } else {
          // Job not found, increment retry count
          retryCount++
        }
      } catch (error) {
        retryCount++
        console.error('Polling error:', error)
      }

      // Timeout handling
      if (retryCount >= MAX_RETRIES) {
        setIsPolling(false)
        setJobStatus('failed')
        const timeoutError = "The execution took too long to complete"
        setError(timeoutError)
        
        setResults(prev => prev ? {
          ...prev,
          status: 'failed',
          errorMessage: timeoutError,
          completedAt: new Date()
        } : null)

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
    }

    // Use fixed polling intervals for now (could be made adaptive with server actions)
    const getPollingInterval = () => {
      switch (jobStatus) {
        case 'pending':
          return 2000 // 2 seconds while waiting to start
        case 'processing':
          return 3000 // 3 seconds while processing  
        case 'streaming':
          return 1500 // 1.5 seconds while streaming
        default:
          return 2000 // Default 2 second interval
      }
    }

    const interval = getPollingInterval()
    pollStreamingJob()
    intervalId = setInterval(pollStreamingJob, interval)

    return () => {
      abortController.abort()
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isPolling, jobId, jobStatus, streamingJob, tool.id, executionId, results, toast, enabledTools])

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
                          value={typeof formField.value === 'string' ? formField.value : ''}
                          className="bg-muted"
                        />
                        ) : field.fieldType === "select" || field.fieldType === "multi_select" ? (
                          <Select onValueChange={formField.onChange} defaultValue={typeof formField.value === 'string' ? formField.value : undefined}>
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
                                    // Type is already narrowed to string in the outer if block
                                    const optionsStr = field.options as string
                                    options = optionsStr.split(",").map(s => ({
                                      value: s.trim(),
                                      label: s.trim()
                                    }))
                                  }
                                } else if (Array.isArray(field.options)) {
                                  options = field.options
                                } else if (field.options && typeof field.options === 'object' && 'values' in field.options) {
                                  // Handle ToolInputFieldOptions format
                                  const optionsObj = field.options as { values?: string[] }
                                  if (Array.isArray(optionsObj.values)) {
                                    options = optionsObj.values.map(val => ({
                                      label: val,
                                      value: val
                                    }))
                                  }
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
                          <DocumentUploadButton
                            label="Add Document for Knowledge"
                            onContent={doc => formField.onChange(doc)}
                            disabled={jobStatus === 'streaming' || jobStatus === 'processing' || isPolling}
                            className="w-full"
                            onError={err => {
                              if (err?.status === 413) {
                                toast({
                                  title: "File Too Large",
                                  description: "Please upload a file smaller than 50MB.",
                                  variant: "destructive"
                                })
                              } else {
                                toast({
                                  title: "Upload Failed",
                                  description: err?.message || "Unknown error",
                                  variant: "destructive"
                                })
                              }
                            }}
                          />
                        ) : (
                        <Input
                          placeholder="Enter your answer..."
                          {...formField}
                          value={typeof formField.value === 'string' ? formField.value : ''}
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
                <Button type="submit" disabled={jobStatus === 'streaming' || jobStatus === 'processing' || isPolling}>
                  {(jobStatus === 'streaming' || jobStatus === 'processing' || isPolling) ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                  ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate</>
                  )}
                </Button>

                {(jobStatus === 'streaming' || jobStatus === 'processing') && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (jobId) {
                        try {
                          const cancelResult = await cancelStreamingJobAction(jobId)
                          if (cancelResult.isSuccess) {
                            setJobStatus('cancelled')
                            setIsPolling(false)
                            toast({
                              title: "Execution Cancelled",
                              description: "The execution has been cancelled"
                            })
                          } else {
                            // Fallback to just stopping local polling
                            setJobStatus('cancelled')
                            setIsPolling(false)
                            toast({
                              title: "Execution Stopped",
                              description: "Local polling stopped - job may continue on server"
                            })
                          }
                        } catch {
                          toast({
                            title: "Cancel Failed",
                            description: "Failed to cancel execution",
                            variant: "destructive"
                          })
                        }
                      }
                    }}
                  >
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                )}
              </div>
          </form>
        </Form>

        {/* Schedule Modal moved outside the form to prevent event bubbling */}
        <ScheduleModal
          tool={tool}
          inputData={form.getValues()}
          onScheduleCreated={() => {
            toast({
              title: "Schedule Created",
              description: "Your assistant execution has been scheduled successfully."
            })
          }}
        />
      </div>

      {(jobStatus !== 'pending' || results || partialContent) && (
        <div className="border rounded-lg p-4 space-y-4 max-w-full">
          <div className="flex items-center justify-between">
            <div className={`text-sm font-medium ${
              jobStatus === 'streaming' || jobStatus === 'processing' ? 'text-blue-600' : 
              jobStatus === 'completed' || results?.status === 'completed' ? 'text-green-600' : 
              jobStatus === 'failed' || results?.status === 'failed' || error ? 'text-red-600' : 
              jobStatus === 'cancelled' ? 'text-orange-600' :
              'text-muted-foreground'
            }`}>
              Status: {
                jobStatus === 'streaming' ? 'Streaming response...' :
                jobStatus === 'processing' ? 'Processing...' :
                jobStatus === 'completed' || results?.status === 'completed' ? 'Completed' :
                jobStatus === 'failed' || results?.status === 'failed' ? 'Failed' :
                jobStatus === 'cancelled' ? 'Cancelled' :
                error ? 'Error' :
                'Ready'
              }
            </div>
            {(jobStatus === 'streaming' || jobStatus === 'processing') && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>

          {/* Tool Usage Indicators */}
          {enabledTools.length > 0 && (
            <div className="tool-execution-status space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Settings className="h-4 w-4" />
                <span>Tools Available ({enabledTools.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {enabledTools.map(toolName => (
                  <Badge key={toolName} variant="outline" className="text-xs">
                    {getToolDisplayName(toolName)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <ErrorBoundary>
            <div className="space-y-6">
              {/* Show streaming job progress and partial content */}
              {(jobStatus === 'streaming' || jobStatus === 'processing' || partialContent || (streamingJob && streamingJob.responseData)) && (
                <div className="space-y-3 p-4 border rounded-md bg-card shadow-sm">
                  <div className="flex items-center justify-between text-sm font-medium mb-2">
                    <div className="flex items-center text-muted-foreground">
                      <Terminal className="h-4 w-4 mr-2" />
                      <span className="font-semibold text-foreground">Assistant Response</span>
                    </div>
                    {(jobStatus === 'streaming' || jobStatus === 'processing') && (
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {jobStatus === 'processing' ? 'Processing...' : 'Streaming...'}
                        </span>
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
                            id={`job-${jobId || 'unknown'}`}
                            content={(() => {
                              // Show final response data if completed
                              if (streamingJob?.responseData && streamingJob.status === 'completed') {
                                return streamingJob.responseData.text || "Response completed"
                              }
                              // Show partial content during streaming
                              if (partialContent) {
                                return partialContent
                              }
                              // Show waiting state
                              if (jobStatus === 'processing') {
                                return "Processing your request..."
                              }
                              if (jobStatus === 'streaming') {
                                return "Waiting for response..."
                              }
                              return "Starting execution..."
                            })()} />
                        </div>
                      </div>
                      {(partialContent || (streamingJob?.responseData && streamingJob.status === 'completed')) && (
                        <div className="flex items-center gap-2 justify-end mt-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Copy output"
                            onClick={() => {
                              const content = streamingJob?.responseData?.text || partialContent || ""
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
              
              {/* Show final results when available from legacy polling (for backward compatibility) */}
              {results?.promptResults && results.promptResults.length > 0 && jobStatus !== 'streaming' && jobStatus !== 'processing' && (
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
                                type="button"
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
                                type="button"
                                variant={promptResult.userFeedback === 'like' ? 'default' : 'ghost'}
                                size="icon"
                                className={`h-7 w-7 ${promptResult.userFeedback === 'like' ? 'bg-green-500/10 hover:bg-green-500/20' : ''}`}
                                title="Like output"
                                onClick={async () => await handleFeedback(promptResult, 'like')}
                              >
                                <ThumbsUp className={`h-3.5 w-3.5 ${promptResult.userFeedback === 'like' ? 'text-green-500' : 'text-muted-foreground'} transition-colors`} />
                                <span className="sr-only">Like output</span>
                              </Button>
                              <Button
                                type="button"
                                variant={promptResult.userFeedback === 'dislike' ? 'destructive' : 'ghost'}
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
              {((results?.status === "completed" || jobStatus === 'completed') || conversationId !== null) && (
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