"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  type Repository,
  createRepository,
  updateRepository,
} from "@/actions/repositories/repository.actions"
import { useAction } from "@/lib/hooks/use-action"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  is_public: z.boolean().default(false),
})

type FormData = z.infer<typeof formSchema>

interface RepositoryFormProps {
  repository?: Repository
}

export function RepositoryForm({ repository }: RepositoryFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const isEditing = !!repository

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: repository?.name || "",
      description: repository?.description || "",
      is_public: repository?.isPublic || false,
    },
  })

  const { execute: executeCreate, isPending: isCreating } = useAction(createRepository, {
    showErrorToast: false,
    showSuccessToast: false
  })
  const { execute: executeUpdate, isPending: isUpdating } = useAction(updateRepository, {
    showErrorToast: false,
    showSuccessToast: false
  })

  const isLoading = isCreating || isUpdating

  async function onSubmit(data: FormData) {
    if (isEditing) {
      const result = await executeUpdate({
        id: repository.id,
        ...data,
      })

      if (result.isSuccess) {
        toast({
          title: "Repository updated",
          description: "Your changes have been saved.",
        })
        router.push(`/admin/repositories/${repository.id}`)
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to update repository",
          variant: "destructive",
        })
      }
    } else {
      const result = await executeCreate(data)

      if (result.isSuccess && result.data) {
        toast({
          title: "Repository created",
          description: "Your repository has been created successfully.",
        })
        router.push(`/admin/repositories/${(result.data as Repository).id}`)
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to create repository",
          variant: "destructive",
        })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? "Edit Repository" : "Create Repository"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Company Knowledge Base"
                    />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for your repository
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
                      {...field}
                      placeholder="Describe what this repository contains..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description of the repository&apos;s purpose
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Public Repository
                    </FormLabel>
                    <FormDescription>
                      Make this repository accessible to all users
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

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Update" : "Create"} Repository
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/repositories")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}