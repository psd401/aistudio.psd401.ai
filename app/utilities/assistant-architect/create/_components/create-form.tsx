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
import { createAssistantArchitectAction, updateAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { useToast } from "@/components/ui/use-toast"

// Form schema
const formSchema = z.object({
  name: z.string().min(3, {
    message: "Name must be at least 3 characters.",
  }),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface CreateFormProps {
  initialData?: {
    id: string
    name: string
    description?: string | null
  }
}

export function CreateForm({ initialData }: CreateFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || ""
    }
  })

  async function onSubmit(values: FormValues) {
    try {
      setIsSubmitting(true)
      
      let result
      if (initialData) {
        // Update existing assistant
        result = await updateAssistantArchitectAction(initialData.id, values)
        if (!result.isSuccess) {
          throw new Error(result.message)
        }
        
        toast({
          title: "Success",
          description: "Assistant updated successfully"
        })
        
        // Navigate to input fields step
        router.push(`/utilities/assistant-architect/${initialData.id}/edit/input-fields`)
      } else {
        // Create new assistant
        result = await createAssistantArchitectAction({
          name: values.name,
          description: values.description || "",
          status: "draft"
        })
        
        if (!result.isSuccess) {
          throw new Error(result.message)
        }

        toast({
          title: "Success",
          description: "Assistant created successfully"
        })

        // Navigate to input fields step
        router.push(`/utilities/assistant-architect/${result.data.id}/edit/input-fields`)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save assistant",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
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
                <Input {...field} />
              </FormControl>
              <FormDescription>
                The name of your Assistant Architect.
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
                <Textarea {...field} />
              </FormControl>
              <FormDescription>
                A brief description of what this Assistant Architect does.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : initialData ? "Save Changes" : "Create Assistant"}
        </Button>
      </form>
    </Form>
  )
} 