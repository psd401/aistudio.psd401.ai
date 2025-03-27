"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { addInputFieldAction } from "@/actions/db/prompt-chains-actions"
import { PlusCircle, X } from "lucide-react"

const optionSchema = z.object({
  label: z.string().min(1, "Option label is required"),
  value: z.string().min(1, "Option value is required")
})

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fieldType: z.enum(["text", "long_text", "select", "multi_select"]),
  options: z.array(optionSchema).optional().default([])
})

interface InputFieldFormProps {
  toolId: string
  currentPosition: number
  onSuccess: () => void
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

export function InputFieldForm({
  toolId,
  currentPosition,
  onSuccess
}: InputFieldFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      fieldType: "text",
      options: []
    }
  })

  const fieldType = form.watch("fieldType")
  const showOptionsField = fieldType === "select" || fieldType === "multi_select"
  const options = form.watch("options") || []

  const addOption = () => {
    const newOptions = [...options, { label: "", value: "" }]
    form.setValue("options", newOptions)
  }

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index)
    form.setValue("options", newOptions)
  }

  const updateOption = (index: number, field: "label" | "value", value: string) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    form.setValue("options", newOptions)
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true)
      
      const result = await addInputFieldAction({
        toolId,
        name: values.name,
        fieldType: values.fieldType,
        options: showOptionsField ? values.options : undefined,
        position: currentPosition
      })

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Input field added successfully"
      })

      form.reset()
      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add input field",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter field name" {...field} />
              </FormControl>
              <FormDescription>
                The label that will be shown to users
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fieldType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="long_text">Long Text</SelectItem>
                  <SelectItem value="select">Select (Dropdown)</SelectItem>
                  <SelectItem value="multi_select">Multi-Select</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The type of input field to display
                {field.value === "long_text" && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Token count will be shown to users when they enter text
                  </div>
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {showOptionsField && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FormLabel>Options</FormLabel>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={addOption}
                className="flex items-center gap-1"
              >
                <PlusCircle className="h-4 w-4" />
                Add Option
              </Button>
            </div>
            
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Label"
                    value={option.label}
                    onChange={(e) => updateOption(index, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={option.value}
                    onChange={(e) => updateOption(index, "value", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              {options.length === 0 && (
                <div className="p-4 border rounded text-sm text-muted-foreground">
                  No options added yet. Click "Add Option" to create options for this field.
                </div>
              )}
            </div>
          </div>
        )}

        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Adding..." : "Add Input Field"}
        </Button>
      </form>
    </Form>
  )
} 