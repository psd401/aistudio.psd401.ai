"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
import { addToolInputFieldAction, updateInputFieldAction } from "@/actions/db/assistant-architect-actions"
import type { SelectToolInputField } from "@/types"

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fieldType: z.enum(["short_text", "long_text", "select", "multi_select", "file_upload"]),
  position: z.number().int().min(0),
  options: z.array(
    z.object({
      label: z.string().min(1, "Option label is required"),
      value: z.string().min(1, "Option value is required")
    })
  ).optional()
})

type FormValues = z.infer<typeof formSchema>

interface InputFieldsFormProps {
  assistantId: string
  inputFields: SelectToolInputField[]
  editingField?: SelectToolInputField | null
  clearEditingField?: () => void
}

export function InputFieldsForm({ 
  assistantId, 
  inputFields, 
  editingField = null, 
  clearEditingField 
}: InputFieldsFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [options, setOptions] = useState<{ label: string; value: string }[]>([])
  const [newOption, setNewOption] = useState({ label: "", value: "" })
  const isEditing = !!editingField

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      fieldType: "short_text",
      position: inputFields.length,
      options: []
    }
  })

  const watchFieldType = form.watch("fieldType")

  // Set form values when editing a field
  useEffect(() => {
    if (editingField) {
      let parsedOptions: { label: string; value: string }[] = [];
      if (Array.isArray(editingField.options)) {
        parsedOptions = editingField.options;
      } else if (typeof editingField.options === "string") {
        parsedOptions = editingField.options.split(",").map((opt: string) => ({
          label: opt.trim(),
          value: opt.trim(),
        }));
      }
      form.reset({
        name: editingField.name,
        fieldType: editingField.fieldType as any,
        position: editingField.position,
        options: parsedOptions,
      });
      setOptions(parsedOptions);
    }
  }, [editingField, form])

  // Update showOptions when field type changes
  useEffect(() => {
    const shouldShowOptions = watchFieldType === "select" || watchFieldType === "multi_select"
    setShowOptions(shouldShowOptions)
    if (!shouldShowOptions) {
      setOptions([])
      form.setValue("options", [])
    }
  }, [watchFieldType, form])

  function handleAddOption() {
    if (newOption.label && newOption.value) {
      const updatedOptions = [...options, newOption]
      setOptions(updatedOptions)
      form.setValue("options", updatedOptions)
      setNewOption({ label: "", value: "" })
    }
  }

  function handleRemoveOption(index: number) {
    const updatedOptions = options.filter((_, i) => i !== index)
    setOptions(updatedOptions)
    form.setValue("options", updatedOptions)
  }

  async function onSubmit(values: FormValues) {
    try {
      setIsLoading(true)
      
      // Only include options for select/multi_select fields
      const optionsToSave = showOptions ? options : undefined
      
      let result;
      
      if (isEditing && editingField) {
        // Update existing field
        result = await updateInputFieldAction(
          editingField.id,
          {
            name: values.name,
            fieldType: values.fieldType as any,
            position: values.position,
            options: optionsToSave
          }
        )
        
        if (clearEditingField) {
          clearEditingField()
        }
      } else {
        // Create new field
        result = await addToolInputFieldAction(
          assistantId,
          {
            name: values.name,
            type: values.fieldType,
            position: values.position,
            options: optionsToSave
          }
        )
      }

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: isEditing 
          ? "Input field updated successfully" 
          : "Input field added successfully"
      })

      // Reset form
      form.reset({
        name: "",
        fieldType: "short_text",
        position: inputFields.length + (isEditing ? 0 : 1),
        options: []
      })
      setOptions([])
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save input field",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter field name..." />
                </FormControl>
                <FormMessage />
                <FormDescription>
                  Label for this input field
                </FormDescription>
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fieldType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Type</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      const shouldShowOptions = value === "select" || value === "multi_select"
                      setShowOptions(shouldShowOptions)
                      if (!shouldShowOptions) {
                        setOptions([])
                        form.setValue("options", [])
                      }
                    }}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a field type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="short_text">Short Text</SelectItem>
                      <SelectItem value="long_text">Long Text</SelectItem>
                      <SelectItem value="select">Single Select</SelectItem>
                      <SelectItem value="multi_select">Multi Select</SelectItem>
                      <SelectItem value="file_upload">File Upload (PDF)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  <FormDescription>
                    Type of input field (text, select, etc.)
                  </FormDescription>
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
                      min="0"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    Order in which this field appears (lower numbers first)
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>

          {showOptions && (
            <div className="border rounded-md p-4 space-y-4">
              <h3 className="text-sm font-medium">Options</h3>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <FormLabel>Label</FormLabel>
                  <Input
                    value={newOption.label}
                    onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                    placeholder="Option Label"
                  />
                </div>
                <div>
                  <FormLabel>Value</FormLabel>
                  <Input
                    value={newOption.value}
                    onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                    placeholder="Option Value"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddOption}
                  disabled={!newOption.label || !newOption.value}
                >
                  Add
                </Button>
              </div>
              
              {options.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-medium">Defined Options</h4>
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center justify-between border p-2 rounded-md">
                      <div>
                        <span className="font-medium">{option.label}</span>
                        <span className="text-muted-foreground ml-2">({option.value})</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <FormDescription>
                Available options for select fields
              </FormDescription>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            {!isEditing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/utilities/assistant-architect/${assistantId}/edit/prompts`)}
              >
                Skip
              </Button>
            )}
            <Button type="submit" disabled={isLoading}>
              {isLoading 
                ? (isEditing ? "Updating..." : "Adding...") 
                : (isEditing ? "Update Field" : "Add Field")
              }
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
} 