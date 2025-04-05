"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { executePromptChainAction } from "@/actions/db/prompt-chains-actions"
import { executeToolAction } from "@/actions/db/prompt-chains-actions"
import type {
  PromptChainToolWithRelations,
  ToolExecutionInput,
  ToolExecutionStatus,
  PromptExecutionResult,
  SelectToolInputField
} from "@/types"
import { Loader2 } from "lucide-react"

interface PromptChainExecutionProps {
  tool: PromptChainToolWithRelations
}

function TokenCount({ text }: { text: string }) {
  const [tokens, setTokens] = useState<number | null>(null)

  useEffect(() => {
    async function countTokens() {
      try {
        const tiktoken = await import("js-tiktoken")
        const enc = tiktoken.getEncoding("cl100k_base") // Base encoding for GPT-4 and GPT-3.5
        const count = enc.encode(text).length
        setTokens(count)
      } catch (error) {
        console.error("Error counting tokens:", error)
        setTokens(null)
      }
    }
    
    countTokens()
  }, [text])

  if (tokens === null) return null

  return (
    <div className="text-xs text-muted-foreground mt-1">
      {tokens.toLocaleString()} tokens
    </div>
  )
}

export function PromptChainExecution({ tool }: PromptChainExecutionProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [inputs, setInputs] = useState<ToolExecutionInput>({})
  const [executionStatus, setExecutionStatus] = useState<ToolExecutionStatus | null>(null)

  const sortedInputFields = [...(tool.inputFields || [])].sort(
    (a, b) => a.position - b.position
  )

  const sortedPrompts = [...(tool.prompts || [])].sort(
    (a, b) => a.position - b.position
  )

  function handleInputChange(field: SelectToolInputField, value: string | string[]) {
    setInputs(prev => ({
      ...prev,
      [field.id]: value
    }))
  }

  // Handle checkbox change for multi-select fields
  function handleCheckboxChange(field: SelectToolInputField, optionValue: string, checked: boolean) {
    const currentValues = (inputs[field.id] as string[]) || []
    let newValues: string[]
    
    if (checked) {
      newValues = [...currentValues, optionValue]
    } else {
      newValues = currentValues.filter(val => val !== optionValue)
    }
    
    handleInputChange(field, newValues)
  }

  // Check if a checkbox should be checked
  function isOptionChecked(field: SelectToolInputField, optionValue: string): boolean {
    const currentValues = inputs[field.id] as string[] || []
    return currentValues.includes(optionValue)
  }

  async function handleExecute() {
    try {
      setIsLoading(true)
      const result = await executePromptChainAction({
        toolId: tool.id,
        inputs
      })

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      setExecutionStatus(result.data)
      toast({
        title: "Success",
        description: "Tool executed successfully"
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to execute tool",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "bg-green-500"
      case "failed":
        return "bg-red-500"
      case "running":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Input Fields</CardTitle>
          <CardDescription>
            Fill in the required input fields to execute the tool
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedInputFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label>{field.name}</Label>
                {field.fieldType === "short_text" && (
                  <Input
                    value={(inputs[field.id] as string) || ""}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    placeholder={field.description || `Enter ${field.name.toLowerCase()}...`}
                  />
                )}
                {field.fieldType === "long_text" && (
                  <div className="space-y-1">
                    <Textarea
                      value={(inputs[field.id] as string) || ""}
                      onChange={(e) => handleInputChange(field, e.target.value)}
                      placeholder={field.description || `Enter ${field.name.toLowerCase()}...`}
                      className="min-h-[100px]"
                    />
                    <TokenCount text={(inputs[field.id] as string) || ""} />
                  </div>
                )}
                {field.fieldType === "select" && field.options && (
                  <Select
                    value={(inputs[field.id] as string) || ""}
                    onValueChange={(value) => handleInputChange(field, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field.name.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.fieldType === "multi_select" && field.options && (
                  <div className="space-y-2">
                    {field.options.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${field.id}-${option.value}`}
                          checked={isOptionChecked(field, option.value)}
                          onCheckedChange={(checked) =>
                            handleCheckboxChange(field, option.value, checked)
                          }
                        />
                        <Label htmlFor={`${field.id}-${option.value}`}>{option.label}</Label>
                      </div>
                    ))}
                  </div>
                )}
                {field.description && (
                  <p className="text-sm text-muted-foreground">{field.description}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button onClick={handleExecute} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : (
                "Execute"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {executionStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Execution status and outputs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedPrompts.map((prompt, index) => {
                const result = executionStatus.results.find(
                  (r) => r.promptId === prompt.id
                )
                return (
                  <div
                    key={`${prompt.id}-${index}`}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{prompt.name}</h4>
                      <Badge
                        className={getStatusColor(result?.status || "pending")}
                      >
                        {result?.status || "pending"}
                      </Badge>
                    </div>

                    {result?.output && (
                      <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                        <pre className="text-sm whitespace-pre-wrap">
                          {result.output}
                        </pre>
                      </ScrollArea>
                    )}

                    {result?.error && (
                      <div className="text-sm text-red-500">
                        Error: {result.error}
                      </div>
                    )}

                    {result?.executionTimeMs && (
                      <div className="text-sm text-muted-foreground">
                        Execution time: {(result.executionTimeMs / 1000).toFixed(2)}s
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 