"use client"

import { useState } from "react"
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
import { updateInputFieldAction } from "@/actions/db/prompt-chains-actions"
import { PlusCircle, X } from "lucide-react"
import type { SelectToolInputField } from "@/db/schema"
import { fieldTypeEnum } from "@/db/schema"

const optionSchema = z.object({
  label: z.string().min(1, "Option label is required"),
  value: z.string().min(1, "Option value is required")
})

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fieldType: z.enum(fieldTypeEnum.enumValues),
  options: z.array(optionSchema).optional().default([])
})

interface EditInputFieldFormProps {
  field: SelectToolInputField
  onSuccess: () => void
}

export function EditInputFieldForm({
  field,
  onSuccess
}: EditInputFieldFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: field.name,
      fieldType: field.fieldType,
      options: field.options || []
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
      
      const result = await updateInputFieldAction(field.id, {
        name: values.name,
        fieldType: values.fieldType,
        options: showOptionsField ? values.options : undefined
      })

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Input field updated successfully"
      })

      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update input field",
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
                  <SelectItem value="short_text">Text</SelectItem>
                  <SelectItem value="long_text">Long Text</SelectItem>
                  <SelectItem value="select">Select (Dropdown)</SelectItem>
                  <SelectItem value="multi_select">Multi-Select</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The type of input field to display
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
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                Add Option
              </Button>
            </div>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Label"
                    value={option.label}
                    onChange={(e) =>
                      updateOption(index, "label", e.target.value)
                    }
                  />
                  <Input
                    placeholder="Value"
                    value={option.value}
                    onChange={(e) =>
                      updateOption(index, "value", e.target.value)
                    }
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
            </div>
          </div>
        )}

        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  )
} 