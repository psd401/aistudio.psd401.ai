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
import { useState, useEffect, useCallback, memo, useMemo, useRef } from "react"
import { useToast } from "@/components/ui/use-toast"
import { SelectToolInputField } from "@/types/db-types"
import { Loader2, Sparkles, AlertCircle, Settings } from "lucide-react"
import { ErrorBoundary } from "@/components/error-boundary"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { collectAndSanitizeEnabledTools, getToolDisplayName } from '@/lib/assistant-architect/tool-utils'
import { ScheduleModal } from "./schedule-modal"
import Image from "next/image"
import DocumentUploadButton from "@/components/ui/document-upload-button"
import { AssistantRuntimeProvider, useThreadRuntime } from '@assistant-ui/react'
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk'
import { Thread } from '@/components/assistant-ui/thread'
import { createLogger } from '@/lib/client-logger'
import { ExecutionProgress } from './execution-progress'

const log = createLogger({ moduleName: 'assistant-architect-streaming' })

// Define base schema outside component to prevent re-creation on each render
const stringSchema = z.string()

/**
 * Sanitize image path to prevent path traversal attacks
 * @param imagePath - The image path from the database
 * @returns Sanitized path or null if invalid
 */
function sanitizeImagePath(imagePath: string | null): string | null {
  if (!imagePath) return null

  // Remove any path traversal attempts
  const sanitized = imagePath.replace(/\.\./g, '').replace(/\//g, '')

  // Validate format (only allow alphanumeric, dash, underscore, and common image extensions)
  const validPattern = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|svg|webp)$/

  if (!validPattern.test(sanitized)) {
    return null
  }

  return sanitized
}

/**
 * Sanitize option labels to prevent XSS attacks
 * @param label - The option label from the database
 * @returns Sanitized label or empty string if invalid
 */
function sanitizeOptionLabel(label: string): string {
  const SAFE_LABEL_REGEX = /^[a-zA-Z0-9\s\-_.,()]+$/
  return SAFE_LABEL_REGEX.test(label) ? label.trim() : ''
}

interface AssistantArchitectStreamingProps {
  tool: AssistantArchitectWithRelations
}

// Runtime provider component to handle streaming
function AssistantArchitectRuntimeProvider({
  children,
  tool,
  inputs,
  onExecutionIdChange,
  onPromptCountChange,
  onExecutionComplete,
  onExecutionError
}: {
  children: React.ReactNode
  tool: AssistantArchitectWithRelations
  inputs: Record<string, unknown>
  onExecutionIdChange: (executionId: number) => void
  onPromptCountChange: (count: number) => void
  onExecutionComplete: () => void
  onExecutionError: (error: string) => void
}) {
  const inputsRef = useRef(inputs)

  useEffect(() => {
    inputsRef.current = inputs
  }, [inputs])

  // Use refs for callbacks to avoid dependency issues
  const onExecutionIdChangeRef = useRef(onExecutionIdChange)
  const onPromptCountChangeRef = useRef(onPromptCountChange)

  useEffect(() => {
    onExecutionIdChangeRef.current = onExecutionIdChange
    onPromptCountChangeRef.current = onPromptCountChange
  }, [onExecutionIdChange, onPromptCountChange])

  // Custom fetch to extract execution metadata from headers
  const customFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init)

    const executionId = response.headers.get('X-Execution-Id')
    const promptCount = response.headers.get('X-Prompt-Count')

    if (executionId) {
      onExecutionIdChangeRef.current(Number(executionId))
      log.debug('Execution started', { executionId, promptCount })
    }

    if (promptCount) {
      onPromptCountChangeRef.current(Number(promptCount))
    }

    return response
  }, [])

  // Use official useChatRuntime (same as Nexus)
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/assistant-architect/execute',
      fetch: customFetch,
      body: () => ({
        toolId: tool.id,
        inputs: inputsRef.current
      })
    })
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StreamingStateMonitor
        onExecutionComplete={onExecutionComplete}
        onExecutionError={onExecutionError}
      />
      <AutoStartExecution tool={tool} />
      {children}
    </AssistantRuntimeProvider>
  )
}

// Component to monitor streaming state changes
function StreamingStateMonitor({
  onExecutionComplete,
  onExecutionError
}: {
  onExecutionComplete: () => void
  onExecutionError: (error: string) => void
}) {
  const runtime = useThreadRuntime()
  const [previousRunning, setPreviousRunning] = useState<boolean | null>(null)
  const completionFiredRef = useRef(false)

  // Use refs to avoid stale closures
  const onExecutionCompleteRef = useRef(onExecutionComplete)
  const onExecutionErrorRef = useRef(onExecutionError)

  useEffect(() => {
    onExecutionCompleteRef.current = onExecutionComplete
    onExecutionErrorRef.current = onExecutionError
  }, [onExecutionComplete, onExecutionError])

  useEffect(() => {
    // Reset completion flag when previousRunning changes to true
    if (previousRunning === true) {
      completionFiredRef.current = false
    }

    // Subscribe to runtime state changes
    const unsubscribe = runtime.subscribe(() => {
      const threadState = runtime.getState()
      const isRunning = threadState.isRunning

      // Detect completion: was running, now not running
      if (previousRunning === true && !isRunning && !completionFiredRef.current) {
        completionFiredRef.current = true
        const messages = threadState.messages
        const lastMessage = messages[messages.length - 1]

        // Check if last message has an error
        if (lastMessage && 'error' in lastMessage && lastMessage.error) {
          const errorMessage = typeof lastMessage.error === 'string'
            ? lastMessage.error
            : 'Execution failed'
          onExecutionErrorRef.current(errorMessage)
        } else {
          onExecutionCompleteRef.current()
        }
      }

      setPreviousRunning(isRunning)
    })

    return unsubscribe
  }, [runtime, previousRunning])

  return null
}

// Component to automatically start execution when runtime is ready
function AutoStartExecution({ tool }: { tool: AssistantArchitectWithRelations }) {
  const runtime = useThreadRuntime()
  const hasStarted = useRef(false)

  useEffect(() => {
    // Only start once when runtime is ready
    if (!hasStarted.current) {
      hasStarted.current = true

      // Append initial message to trigger execution
      runtime.append({
        role: 'user',
        content: [{ type: 'text', text: `Execute ${tool.name}` }]
      })

      log.debug('Auto-started assistant architect execution', { toolName: tool.name })
    }
  }, [runtime, tool.name])

  return null
}

export const AssistantArchitectStreaming = memo(function AssistantArchitectStreaming({
  tool
}: AssistantArchitectStreamingProps) {
  const { toast } = useToast()
  const [promptCount, setPromptCount] = useState<number>(0)
  const [enabledTools, setEnabledTools] = useState<string[]>([])
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [isExecuting, setIsExecuting] = useState(false)
  const [hasResults, setHasResults] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Collect enabled tools from the assistant architect when component mounts
  useEffect(() => {
    const tools = tool.prompts ? collectAndSanitizeEnabledTools(tool.prompts) : []
    setEnabledTools(tools)
  }, [tool])

  // Create form schema based on tool input fields
  const formSchema = useMemo(() => z.object(
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
  ), [tool.inputFields])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: tool.inputFields.reduce((acc: Record<string, string>, field: SelectToolInputField) => {
      acc[field.name] = ""
      return acc
    }, {})
  })

  // Handle form submission
  const onSubmit = useCallback(async (values: z.infer<typeof formSchema>) => {
    // Prevent re-execution if already running
    if (isExecuting) {
      return
    }

    // If we have completed results, confirm before re-running
    if (hasResults) {
      const confirmRerun = window.confirm(
        "You have existing results. Do you want to run the assistant again? This will clear your current results and chat."
      )
      if (!confirmRerun) {
        return
      }
      // Reset state for new execution
      setHasResults(false)
      setError(null)
    }

    try {
      setIsExecuting(true)
      setInputs(values)
      setError(null)

      log.info('Form submitted', { toolId: tool.id, inputs: Object.keys(values) })

      toast({
        title: "Execution Started",
        description: "The assistant architect is now executing"
      })
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "Failed to start execution"
      setError(errorMessage)
      setIsExecuting(false)

      toast({
        title: "Execution Error",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }, [isExecuting, hasResults, tool.id, toast])

  const handleExecutionIdChange = useCallback((newExecutionId: number) => {
    log.debug('Execution ID received', { executionId: newExecutionId })
  }, [])

  const handlePromptCountChange = useCallback((count: number) => {
    setPromptCount(count)
    log.debug('Prompt count received', { promptCount: count })
  }, [])

  const handleExecutionComplete = useCallback(() => {
    setIsExecuting(false)
    setHasResults(true)

    toast({
      title: "Execution Completed",
      description: "Assistant architect execution completed successfully"
    })
  }, [toast])

  const handleExecutionError = useCallback((errorMessage: string) => {
    setError(errorMessage)
    setIsExecuting(false)

    toast({
      title: "Execution Failed",
      description: errorMessage,
      variant: "destructive"
    })
  }, [toast])

  // Memoized components for better performance
  const ToolHeader = memo(({ tool }: { tool: AssistantArchitectWithRelations }) => {
    const safeImagePath = sanitizeImagePath(tool.imagePath)

    return (
      <div>
        <div className="flex items-start gap-4">
          {safeImagePath && (
            <div className="relative w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-muted/20 p-1">
              <div className="relative w-full h-full rounded-lg overflow-hidden ring-1 ring-black/10">
                <Image
                  src={`/assistant_logos/${safeImagePath}`}
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
    )
  })

  const ErrorAlert = memo(({ errorMessage }: { errorMessage: string }) => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Execution Error</AlertTitle>
      <AlertDescription className="mt-2 text-sm">
        {errorMessage}
      </AlertDescription>
    </Alert>
  ))

  // Add display names to memoized components
  ToolHeader.displayName = "ToolHeader"
  ErrorAlert.displayName = "ErrorAlert"

  return (
    <div className="space-y-6">
      <ToolHeader tool={tool} />

      {error && (
        <ErrorAlert errorMessage={error} />
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
                          disabled={isExecuting}
                        />
                      ) : field.fieldType === "select" || field.fieldType === "multi_select" ? (
                        <Select
                          onValueChange={formField.onChange}
                          defaultValue={typeof formField.value === 'string' ? formField.value : undefined}
                          disabled={isExecuting}
                        >
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
                                  const optionsStr = field.options as string
                                  options = optionsStr.split(",").map(s => ({
                                    value: s.trim(),
                                    label: s.trim()
                                  }))
                                }
                              } else if (Array.isArray(field.options)) {
                                options = field.options
                              } else if (field.options && typeof field.options === 'object' && 'values' in field.options) {
                                const optionsObj = field.options as { values?: string[] }
                                if (Array.isArray(optionsObj.values)) {
                                  options = optionsObj.values.map(val => ({
                                    label: val,
                                    value: val
                                  }))
                                }
                              }
                              // Sanitize option labels and filter out invalid ones
                              const sanitizedOptions = options
                                .map(opt => ({
                                  ...opt,
                                  label: sanitizeOptionLabel(opt.label)
                                }))
                                .filter(opt => opt.label !== '')

                              return sanitizedOptions.map(option => (
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
                          disabled={isExecuting}
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
                          disabled={isExecuting}
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="flex gap-2">
              <Button type="submit" disabled={isExecuting}>
                {isExecuting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate</>
                )}
              </Button>
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

      {/* Streaming execution section - Thread remains visible after completion */}
      {(isExecuting || hasResults) && (
        <ErrorBoundary>
          <AssistantArchitectRuntimeProvider
            tool={tool}
            inputs={inputs}
            onExecutionIdChange={handleExecutionIdChange}
            onPromptCountChange={handlePromptCountChange}
            onExecutionComplete={handleExecutionComplete}
            onExecutionError={handleExecutionError}
          >
            <div className="space-y-6">
              {/* Progress indicator for multi-prompt execution */}
              {promptCount > 1 && isExecuting && (
                <ExecutionProgress
                  totalPrompts={promptCount}
                  prompts={tool.prompts || []}
                />
              )}

              {/* Thread component for streaming output and follow-up conversations */}
              <div className="border rounded-lg p-4 space-y-4 max-w-full">
                <Thread />
              </div>
            </div>
          </AssistantArchitectRuntimeProvider>
        </ErrorBoundary>
      )}
    </div>
  )
})
