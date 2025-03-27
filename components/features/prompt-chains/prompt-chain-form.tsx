"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import { useToast } from "@/components/ui/use-toast"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { createPromptChainToolAction } from "@/actions/db/prompt-chains-actions"
import type { CreatePromptChainToolForm } from "@/types"

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isParallel: z.boolean().default(false),
  timeoutSeconds: z.number().min(0).optional()
})

interface PromptChainFormProps {
  onSuccess?: (toolId: string) => void
}

export function PromptChainForm({ onSuccess }: PromptChainFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<CreatePromptChainToolForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      isParallel: false,
      timeoutSeconds: undefined
    }
  })

  async function onSubmit(values: CreatePromptChainToolForm) {
    try {
      setIsLoading(true)
      console.log("Submitting form with values:", values)
      
      console.log("About to call createPromptChainToolAction")
      
      const result = await createPromptChainToolAction(values)
      console.log("Form submission result:", result)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Tool created successfully"
      })

      if (onSuccess) {
        onSuccess(result.data.id)
      } else {
        router.push(`/utilities/prompt-chains/${result.data.id}`)
      }
    } catch (error) {
      console.error("Form submission error:", error)
      if (error instanceof Error) {
        console.error("Error name:", error.name)
        console.error("Error message:", error.message)
        console.error("Error stack:", error.stack)
      }
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tool",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
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
                <Input placeholder="My Prompt Chain Tool" {...field} />
              </FormControl>
              <FormDescription>
                A descriptive name for your tool
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
                  placeholder="What does your tool do?"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Explain what your tool does and how to use it
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isParallel"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Parallel Execution</FormLabel>
                <FormDescription>
                  Allow prompts to run in parallel when possible
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="timeoutSeconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Timeout (seconds)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Optional"
                  {...field}
                  onChange={(e) => {
                    const value = e.target.value
                    field.onChange(value === "" ? undefined : parseInt(value, 10))
                  }}
                />
              </FormControl>
              <FormDescription>
                Maximum time to wait for the entire chain to complete
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Creating..." : "Create Tool"}
        </Button>
      </form>
    </Form>
  )
} 