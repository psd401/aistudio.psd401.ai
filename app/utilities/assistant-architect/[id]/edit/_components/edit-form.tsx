"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { updateAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { useToast } from "@/components/ui/use-toast"

// Form schema
const formSchema = z.object({
  name: z.string().min(3, {
    message: "Name must be at least 3 characters.",
  }),
  description: z.string().optional(),
  isParallel: z.boolean().default(false),
})

type FormValues = z.infer<typeof formSchema>

// Tool type matching the data needed for the form
interface Tool {
  id: string
  name: string
  description: string | null
  isParallel: boolean
}

interface EditAssistantArchitectFormProps {
  tool: Tool
}

export function EditAssistantArchitectForm({ tool }: EditAssistantArchitectFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  // Initialize form with existing tool data
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tool.name,
      description: tool.description || "",
      isParallel: tool.isParallel || false,
    },
  })

  async function onSubmit(values: FormValues) {
    setIsLoading(true)
    try {
      const result = await updateAssistantArchitectAction(tool.id, {
        name: values.name,
        description: values.description,
        isParallel: values.isParallel
      })

      if (result.isSuccess) {
        toast({
          title: "Tool updated",
          description: "Assistant Architect has been updated successfully"
        })
        router.push(`/utilities/assistant-architect/${tool.id}`)
        router.refresh()
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred"
      })
      console.error(error)
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Name of your tool" {...field} />
              </FormControl>
              <FormDescription>
                This is the name that will be displayed to users.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what this tool does"
                  className="resize-none"
                  rows={3}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Provide a brief description of what your Assistant Architect does.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isParallel"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Run Prompts in Parallel</FormLabel>
                <FormDescription>
                  If checked, all prompts in this Assistant Architect will be executed simultaneously (use with caution).
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/utilities/assistant-architect/${tool.id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Updating..." : "Update Assistant Architect"}
          </Button>
        </div>
      </form>
    </Form>
  )
} 