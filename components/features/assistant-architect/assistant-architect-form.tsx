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
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { createAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import type { CreateAssistantArchitectForm } from "@/types"

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(255),
  description: z.string().max(1000).optional()
})

interface AssistantArchitectFormProps {
  onSuccess?: (newToolId: string) => void
}

export function AssistantArchitectForm({ onSuccess }: AssistantArchitectFormProps) {
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: ""
    }
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const result = await createAssistantArchitectAction(values)
      
      if (result.isSuccess && result.data) {
        toast({
          title: "Success",
          description: "Assistant Architect created successfully"
        })
        
        if (onSuccess) {
          onSuccess(result.data.id)
        }
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error creating Assistant Architect:", error)
      toast({
        title: "Error",
        description: "Failed to create Assistant Architect",
        variant: "destructive"
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
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating..." : "Create Assistant Architect"}
        </Button>
      </form>
    </Form>
  )
} 