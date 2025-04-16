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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { createAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import type { CreateAssistantArchitectForm } from "@/types"

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(255),
  description: z.string().max(1000).optional(),
  isParallel: z.boolean().default(false)
})

interface AssistantArchitectFormProps {
  onSuccess?: (newToolId: string) => void
}

export function AssistantArchitectForm({ onSuccess }: AssistantArchitectFormProps) {
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm<CreateAssistantArchitectForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      isParallel: false
    }
  })

  async function onSubmit(values: CreateAssistantArchitectForm) {
    console.log("Form submitted:", values)
    try {
      console.log("About to call createAssistantArchitectAction")
      const result = await createAssistantArchitectAction(values)
      console.log("Action result:", result)

      if (result.isSuccess) {
        toast({
          title: "Success!",
          description: "Assistant Architect created."
        })
        if (onSuccess) {
          onSuccess(result.data.id)
        } else {
          router.push(`/utilities/assistant-architect/${result.data.id}`)
        }
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message || "Failed to create Assistant Architect."
        })
      }
    } catch (error) {
      console.error("Submission error:", error)
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: "An unexpected error occurred."
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="My Assistant Architect" {...field} />
              </FormControl>
              <FormDescription>
                Give your Assistant Architect a descriptive name.
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
                  placeholder="Describe what this Assistant Architect does..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Explain the purpose and workflow of this Assistant Architect.
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
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating..." : "Create Assistant Architect"}
        </Button>
      </form>
    </Form>
  )
} 