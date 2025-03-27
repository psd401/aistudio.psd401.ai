"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { updatePromptAction } from "@/actions/db/prompt-chains-actions"
import type { SelectAiModel, SelectChainPrompt, SelectToolInputField } from "@/types"

function TokenCount({ text, modelName = "gpt-4" }: { text: string; modelName?: string }) {
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
  }, [text, modelName])

  if (tokens === null) return null

  return (
    <div className="text-xs text-muted-foreground mt-1">
      {tokens.toLocaleString()} tokens
    </div>
  )
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  content: z.string().min(1, "Content is required"),
  systemContext: z.string().optional(),
  modelId: z.string().min(1, "Model is required"),
  position: z.number().int().min(0),
  inputMapping: z.record(z.string(), z.string()).optional()
})

interface EditPromptFormProps {
  toolId: string
  prompt: SelectChainPrompt
  models: SelectAiModel[]
  previousPrompts?: SelectChainPrompt[]
  inputFields?: SelectToolInputField[]
}

export function EditPromptForm({
  toolId,
  prompt,
  models,
  previousPrompts = [],
  inputFields = []
}: EditPromptFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [newMapping, setNewMapping] = useState<InputMapping>({ variable: "", sourceId: "" })
  const [mappings, setMappings] = useState<Record<string, string>>(prompt.inputMapping || {})

  // Filter available prompts based on position
  const availablePrompts = previousPrompts.filter(p => p.position < prompt.position)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: prompt.name,
      content: prompt.content,
      systemContext: prompt.systemContext || "",
      modelId: prompt.modelId.toString(),
      position: prompt.position,
      inputMapping: prompt.inputMapping || {}
    }
  })

  useEffect(() => {
    // Remove mappings to prompts that are now after this prompt
    const updatedMappings = { ...mappings }
    let hasRemovedMappings = false

    Object.entries(updatedMappings).forEach(([variable, sourceId]) => {
      const sourcePrompt = previousPrompts.find(p => p.id === sourceId)
      if (sourcePrompt && sourcePrompt.position >= prompt.position) {
        delete updatedMappings[variable]
        hasRemovedMappings = true
      }
    })

    if (hasRemovedMappings) {
      setMappings(updatedMappings)
      toast({
        title: "Input Mappings Updated",
        description: "Some input mappings were removed to prevent circular dependencies.",
      })
    }
  }, [prompt.position, previousPrompts, mappings, toast])

  function handleAddMapping() {
    if (newMapping.variable && newMapping.sourceId) {
      const updatedMappings = {
        ...mappings,
        [newMapping.variable]: newMapping.sourceId
      }
      setMappings(updatedMappings)
      form.setValue("inputMapping", updatedMappings)
      setNewMapping({ variable: "", sourceId: "" })
    }
  }

  function handleRemoveMapping(variable: string) {
    const { [variable]: _, ...rest } = mappings
    setMappings(rest)
    form.setValue("inputMapping", rest)
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true)
      
      const result = await updatePromptAction(prompt.id, {
        name: values.name,
        content: values.content,
        systemContext: values.systemContext,
        modelId: parseInt(values.modelId),
        position: values.position,
        inputMapping: Object.keys(mappings).length > 0 ? mappings : undefined
      })

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Prompt updated successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update prompt",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter prompt name..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="modelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value)}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {models.find(m => m.id === field.value)?.name || "Select a model"}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={model.id.toString()}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    value={field.value?.toString() || "0"}
                    onChange={(e) => {
                      const value = e.target.value === "" ? 0 : parseInt(e.target.value)
                      field.onChange(isNaN(value) ? 0 : value)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <div className="mb-2 text-sm text-muted-foreground">
                Use variables from your input mappings by wrapping them in ${"{}"}, for example: ${"{text}"} or ${"{summary}"}. 
                These will be replaced with actual values when the prompt runs.
              </div>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Enter prompt content..."
                  className="min-h-[150px]"
                />
              </FormControl>
              <FormMessage />
              <TokenCount 
                text={field.value} 
                modelName={models.find(m => m.id === form.getValues("modelId"))?.modelId || "gpt-4"} 
              />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="systemContext"
          render={({ field }) => (
            <FormItem>
              <FormLabel>System Context (Hidden from users)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Enter hidden system context..."
                  className="min-h-[80px]"
                />
              </FormControl>
              <FormMessage />
              <TokenCount 
                text={field.value || ""} 
                modelName={models.find(m => m.id === form.getValues("modelId"))?.modelId || "gpt-4"} 
              />
              <p className="text-xs text-muted-foreground mt-1">
                This context will be passed to the AI model but not shown to users. Use it for providing background information, formatting rules, or other guidance.
              </p>
            </FormItem>
          )}
        />

        <div className="border rounded-md p-4">
          <h3 className="text-sm font-medium mb-2">Input Mappings</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create variables to use input field values or outputs from previous prompts. 
            For example, map "summary" to a previous prompt's output, then use ${"{summary}"} in your prompt content.
          </p>
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <FormLabel>Variable Name</FormLabel>
                <Input
                  value={newMapping.variable}
                  onChange={(e) =>
                    setNewMapping({ ...newMapping, variable: e.target.value })
                  }
                  placeholder="Enter variable name..."
                />
              </div>
              <div className="flex-1">
                <FormLabel>Source</FormLabel>
                <Select
                  value={newMapping.sourceId}
                  onValueChange={(value) =>
                    setNewMapping({ ...newMapping, sourceId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {inputFields.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-medium">Input Fields</div>
                        {inputFields.map((field) => (
                          <SelectItem key={field.id} value={`input.${field.id}`}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {availablePrompts.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-medium">Previous Prompts</div>
                        {availablePrompts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={handleAddMapping}
                variant="outline"
                size="sm"
                className="mb-0.5"
              >
                Add
              </Button>
            </div>

            {Object.keys(mappings).length > 0 && (
              <div className="space-y-2">
                {Object.entries(mappings).map(([variable, sourceId]) => {
                  const isInputField = sourceId.startsWith("input.")
                  const actualId = isInputField ? sourceId.replace("input.", "") : sourceId
                  const source = isInputField 
                    ? inputFields.find(f => f.id === actualId)
                    : previousPrompts.find(p => p.id === sourceId)
                  const sourceName = source ? source.name : "Unknown"
                  const sourceType = isInputField ? "Input Field" : "Prompt"
                  
                  return (
                    <div
                      key={variable}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div>
                        <span className="font-mono">${variable}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          ← {sourceName} ({sourceType})
                        </span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleRemoveMapping(variable)}
                        variant="ghost"
                        size="sm"
                      >
                        Remove
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between">
          <Button 
            type="button"
            variant="outline"
            onClick={() => router.push(`/utilities/prompt-chains/${toolId}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  )
} 