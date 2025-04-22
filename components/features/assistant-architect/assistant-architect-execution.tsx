"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { useToast } from "@/components/ui/use-toast"
import { executeAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { getJobAction } from "@/actions/db/jobs-actions"
import { SelectJob } from "@/db/schema"
import { ExecutionResultDetails, JobOutput, JobPromptResult } from "@/types/assistant-architect-types"
import { Loader2, Bot, User, Terminal } from "lucide-react"
import ReactMarkdown from "react-markdown"
import ErrorBoundary from "@/components/utilities/error-boundary"
import type { SelectPromptResult } from "@/db/schema"

interface AssistantArchitectExecutionProps {
  tool: AssistantArchitectWithRelations
}

export function AssistantArchitectExecution({ tool }: AssistantArchitectExecutionProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<ExecutionResultDetails | null>(null)

  // Create form schema based on tool input fields
  const formSchema = z.object(
    tool.inputFields.reduce((acc: Record<string, z.ZodTypeAny>, field: any) => {
      let fieldSchema: z.ZodTypeAny = z.string()
      if (field.type === "textarea") {
        fieldSchema = z.string()
      } else if (field.type === "select") {
        fieldSchema = z.string()
      }

      if (field.isRequired) {
        fieldSchema = fieldSchema.min(1, `${field.label} is required.`)
      }

      acc[field.name] = fieldSchema
      return acc
    }, {})
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: tool.inputFields.reduce((acc: Record<string, any>, field: any) => {
      acc[field.name] = field.defaultValue || ""
      return acc
    }, {})
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true)
    setResults(null)
    
    try {
      const result = await executeAssistantArchitectAction({
        toolId: tool.id,
        inputs: values
      })

      if (result.isSuccess && result.data?.jobId) {
        setJobId(result.data.jobId)
        setIsPolling(true)
        toast({ title: "Execution Started", description: "The tool is now running" })
      } else {
        toast({ 
          title: "Execution Failed", 
          description: result.message,
          variant: "destructive"
        })
        setIsLoading(false)
      }
    } catch (error) {
      console.error("Error executing tool:", error)
      toast({ 
        title: "Execution Error", 
        description: "Failed to start execution",
        variant: "destructive"
      })
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    let retryCount = 0
    const MAX_RETRIES = 120 // Allow up to 6 minutes (3s * 120)
    const BACKOFF_THRESHOLD = 20 // After 20 retries, increase polling interval
    let currentInterval = 3000 // Start with 3s intervals

    async function pollJob() {
      if (!jobId) return
      
      try {
        const result = await getJobAction(jobId)
        retryCount++

        if (result.isSuccess && result.data) {
          const job = result.data as SelectJob
          
          if (job.status === "completed" || job.status === "failed") {
            setIsLoading(false)
            setIsPolling(false)
            
            if (job.output) {
              const outputData = JSON.parse(job.output) as JobOutput
              setResults({
                id: outputData.executionId,
                toolId: tool.id,
                userId: job.userId,
                status: job.status,
                inputData: JSON.parse(job.input),
                startedAt: new Date(job.createdAt),
                promptResults: outputData.results.map((result: JobPromptResult) => ({
                  id: result.promptId,
                  executionId: outputData.executionId,
                  promptId: result.promptId,
                  inputData: result.input,
                  outputData: result.output,
                  status: result.status,
                  startedAt: new Date(result.startTime),
                  completedAt: result.endTime ? new Date(result.endTime) : undefined,
                  executionTimeMs: result.executionTimeMs
                }))
              })
            }

            toast({ 
              title: "Execution Finished", 
              description: `Status: ${job.status}${job.error ? ` - ${job.error}` : ""}`,
              variant: job.status === "completed" ? "default" : "destructive"
            })

            if (intervalId) {
              clearInterval(intervalId)
            }
          } else if (retryCount >= MAX_RETRIES) {
            toast({ 
              title: "Long Running Operation", 
              description: "This operation is taking longer than usual. You can leave this page and check back later."
            })
          } else if (retryCount >= BACKOFF_THRESHOLD && currentInterval === 3000) {
            if (intervalId) {
              clearInterval(intervalId)
            }
            currentInterval = 10000 // Switch to 10s intervals
            intervalId = setInterval(pollJob, currentInterval)
          }
        } else {
          console.error(`Error polling job ${jobId}:`, result.message)
          if (retryCount >= 3) {
            toast({ 
              title: "Polling Warning", 
              description: "Having trouble getting updates. Will keep trying.",
              variant: "destructive"
            })
          }
        }
      } catch (error) {
        console.error("Polling error:", error)
        if (retryCount >= 3) {
          toast({ 
            title: "Connection Warning", 
            description: "Having trouble connecting. Will keep trying.",
            variant: "destructive"
          })
        }
      }
    }

    if (isPolling && jobId) {
      pollJob() // Initial poll
      intervalId = setInterval(pollJob, currentInterval)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isPolling, jobId, toast, tool.id])

  // Keep results displayed even after polling stops
  useEffect(() => {
    if (jobId && !isPolling && !isLoading && !results) {
      const fetchResults = async () => {
        try {
          const result = await getJobAction(jobId)
          if (result.isSuccess && result.data && result.data.output) {
            const outputData = JSON.parse(result.data.output)
            setResults({
              id: outputData.executionId,
              toolId: tool.id,
              userId: result.data.userId,
              status: result.data.status,
              inputData: JSON.parse(result.data.input),
              startedAt: new Date(result.data.createdAt),
              promptResults: outputData.results.map((result: JobPromptResult) => ({
                id: result.promptId,
                executionId: outputData.executionId,
                promptId: result.promptId,
                inputData: result.input,
                outputData: result.output,
                status: result.status,
                startedAt: new Date(result.startTime),
                completedAt: result.endTime ? new Date(result.endTime) : undefined,
                executionTimeMs: result.executionTimeMs
              }))
            })
          }
        } catch (error) {
          console.error("Error fetching final results:", error)
        }
      }
      fetchResults()
    }
  }, [jobId, isPolling, isLoading, results, tool.id])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configure & Run: {tool.name}</CardTitle>
          <CardDescription>
            Fill in the required inputs to execute this Assistant Architect.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CardContent className="space-y-4">
              {tool.inputFields.map((field: any) => (
                <FormField
                  key={field.id}
                  control={form.control}
                  name={field.name}
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>{field.label}{field.isRequired && " *"}</FormLabel>
                      <FormControl>
                        {field.type === "textarea" ? (
                          <Textarea placeholder={`Enter ${field.label}...`} {...formField} />
                        ) : field.type === "select" ? (
                          <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${field.label}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options || "").split(",").map((option: string) => (
                                <SelectItem key={option.trim()} value={option.trim()}>
                                  {option.trim()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input placeholder={`Enter ${field.label}...`} {...formField} />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executing...</>
                ) : (
                  "Run Assistant Architect"
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {(isLoading || results) && (
        <Card>
          <CardHeader>
            <CardTitle>Execution Results</CardTitle>
            {results && <CardDescription>Status: {results.status}{results.errorMessage ? ` - Error: ${results.errorMessage}` : ""}</CardDescription>}
            {isLoading && !results && <CardDescription>Waiting for results...</CardDescription>}
          </CardHeader>
          <ErrorBoundary fallbackMessage="Failed to render execution results.">
            <CardContent className="space-y-4">
              {isLoading && !results && (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {results?.promptResults && results.promptResults.length > 0 ? (
                results.promptResults.map((promptResult: JobPromptResult, index: number) => (
                  <div key={promptResult.id || index} className="space-y-2 p-4 border rounded-md bg-muted/20">
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      <Terminal className="h-4 w-4 mr-2" /> Prompt {index + 1} ({promptResult.status})
                    </div>
                    {promptResult.inputData && (
                      <div className="p-3 border bg-background/50 rounded">
                        <div className="flex items-start text-xs font-semibold text-blue-600 mb-1">
                          <User className="h-3 w-3 mr-1.5 flex-shrink-0 mt-0.5"/> Input Data Used
                        </div>
                        <pre className="text-xs whitespace-pre-wrap font-mono">{JSON.stringify(promptResult.inputData, null, 2)}</pre>
                      </div>
                    )}
                    {promptResult.outputData && (
                      <div className="p-3 border bg-background/50 rounded">
                        <div className="flex items-start text-xs font-semibold text-green-600 mb-1">
                          <Bot className="h-3 w-3 mr-1.5 flex-shrink-0 mt-0.5"/> Output
                        </div>
                        <ReactMarkdown className="prose prose-sm max-w-none">
                          {promptResult.outputData}
                        </ReactMarkdown>
                      </div>
                    )}
                    {promptResult.errorMessage && (
                      <div className="text-xs text-red-600 p-2 border border-red-200 bg-red-50 rounded">
                        Error: {promptResult.errorMessage}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground pt-1">
                      Duration: {promptResult.executionTimeMs ? `${promptResult.executionTimeMs}ms` : "N/A"}
                    </div>
                  </div>
                ))
              ) : (
                !isLoading && (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )
              )}
            </CardContent>
          </ErrorBoundary>
        </Card>
      )}
    </div>
  )
} 