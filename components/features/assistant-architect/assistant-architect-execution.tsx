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
import { executeAssistantArchitectAction, getExecutionResultsAction } from "@/actions/db/assistant-architect-actions"
import { AssistantArchitectWithRelations, ExecutionResultDetails } from "@/types"
import { Loader2, Bot, User, Terminal } from "lucide-react"
import ReactMarkdown from "react-markdown"
import ErrorBoundary from "@/components/utilities/error-boundary"
import type { SelectPromptResult } from "@/db/schema"

interface AssistantArchitectExecutionProps {
  tool: AssistantArchitectWithRelations
}

export function AssistantArchitectExecution({ tool }: AssistantArchitectExecutionProps) {
  const { toast } = useToast()
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [results, setResults] = useState<ExecutionResultDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  const formSchema = z.object(
    tool.inputFields.reduce((acc, field) => {
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
    }, {} as Record<string, z.ZodTypeAny>)
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: tool.inputFields.reduce((acc, field) => {
      acc[field.name] = field.defaultValue || ""
      return acc
    }, {} as Record<string, any>)
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true)
    setExecutionId(null)
    setResults(null)

    const result = await executeAssistantArchitectAction({
      toolId: tool.id,
      inputs: values
    })

    if (result.isSuccess && result.data.id) {
      toast({ title: "Execution Started", description: "Polling for results..." })
      setExecutionId(result.data.id)
      setIsPolling(true)
      setIsLoading(false)
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.message || "Failed to start Assistant Architect execution."
      })
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 120; // Allow up to 6 minutes (3s * 120)
    const BACKOFF_THRESHOLD = 20; // After 20 retries, increase polling interval
    let currentInterval = 3000; // Start with 3s intervals

    async function pollResults() {
      if (!executionId) return;
      
      try {
        const result = await getExecutionResultsAction(executionId);
        retryCount++;

        if (result.isSuccess && result.data) {
          // Format the data to match the ExecutionResultDetails type
          const formattedData: ExecutionResultDetails = {
            id: executionId,
            toolId: tool.id,
            userId: "", // This will be filled by the backend
            inputData: {},
            status: result.data.status,
            startedAt: new Date(),
            promptResults: result.data.promptResults || [],
          };
          
          setResults(formattedData);

          // If we have results, reset the error count
          retryCount = 0;

          if (result.data.status === "completed" || result.data.status === "failed") {
            setIsLoading(false);
            setIsPolling(false);
            toast({ title: "Execution Finished", description: `Status: ${result.data.status}` });
            if (intervalId) {
              clearInterval(intervalId);
            }
          } else if (retryCount >= MAX_RETRIES) {
            // Don't stop polling, just notify the user it's taking longer than expected
            toast({ 
              title: "Long Running Operation", 
              description: "This operation is taking longer than usual. You can leave this page and check back later.",
            });
          } else if (retryCount >= BACKOFF_THRESHOLD && currentInterval === 3000) {
            // After BACKOFF_THRESHOLD retries, increase polling interval to reduce load
            if (intervalId) {
              clearInterval(intervalId);
            }
            currentInterval = 10000; // Switch to 10s intervals
            intervalId = setInterval(pollResults, currentInterval);
          }
        } else {
          console.error(`Error polling for ${executionId}:`, result.message);
          // Only show error toast if we've had multiple consecutive failures
          if (retryCount >= 3) {
            toast({ 
              title: "Polling Warning", 
              description: "Having trouble getting updates. Will keep trying.",
              variant: "destructive"
            });
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
        // Only show error toast if we've had multiple consecutive failures
        if (retryCount >= 3) {
          toast({ 
            title: "Connection Warning", 
            description: "Having trouble connecting. Will keep trying.",
            variant: "destructive"
          });
        }
      }
    }

    if (isPolling && executionId) {
      // Initial poll
      pollResults();
      // Then start interval
      intervalId = setInterval(pollResults, currentInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, executionId, toast, tool.id]);

  // Keep results displayed even after polling stops
  useEffect(() => {
    if (executionId && !isPolling && !isLoading && !results) {
      const fetchResults = async () => {
        try {
          const result = await getExecutionResultsAction(executionId);
          if (result.isSuccess && result.data) {
            setResults(result.data);
          }
        } catch (error) {
          console.error("Error fetching final results:", error);
        }
      };
      fetchResults();
    }
  }, [executionId, isPolling, isLoading, results]);

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
              {tool.inputFields.map((field) => (
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
                              {(field.options || "").split(",").map((option) => (
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
                results.promptResults.map((promptResult: SelectPromptResult, index: number) => (
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