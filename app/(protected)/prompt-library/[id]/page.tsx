"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPrompt, updatePrompt, deletePrompt } from "@/actions/prompt-library.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { ArrowLeft, Save, Trash2 } from "lucide-react"
import { TagInput } from "../_components/tag-input"
import type { Prompt, PromptVisibility } from "@/lib/prompt-library/types"

export default function PromptEditPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const promptId = params.id as string

  const [formData, setFormData] = useState<Partial<Prompt>>({
    title: '',
    content: '',
    description: '',
    visibility: 'private',
    tags: []
  })

  // Fetch prompt
  const { data: promptResult, isLoading } = useQuery({
    queryKey: ['prompt', promptId],
    queryFn: async () => {
      const response = await getPrompt(promptId)
      if (!response.isSuccess) {
        throw new Error(response.message)
      }
      return response.data
    },
    enabled: !!promptId
  })

  // Populate form when data loads
  useEffect(() => {
    if (promptResult) {
      setFormData({
        title: promptResult.title,
        content: promptResult.content,
        description: promptResult.description || '',
        visibility: promptResult.visibility,
        tags: promptResult.tags || []
      })
    }
  }, [promptResult])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      return await updatePrompt(promptId, {
        title: formData.title,
        content: formData.content,
        description: formData.description || undefined,
        visibility: formData.visibility,
        tags: formData.tags
      })
    },
    onSuccess: (response) => {
      if (response.isSuccess) {
        toast.success("Prompt updated successfully")
        queryClient.invalidateQueries({ queryKey: ['prompt', promptId] })
        queryClient.invalidateQueries({ queryKey: ['prompts'] })
      } else {
        toast.error(response.message)
      }
    },
    onError: () => {
      toast.error("Failed to update prompt")
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await deletePrompt(promptId)
    },
    onSuccess: (response) => {
      if (response.isSuccess) {
        toast.success("Prompt deleted successfully")
        queryClient.invalidateQueries({ queryKey: ['prompts'] })
        router.push('/prompt-library')
      } else {
        toast.error(response.message)
      }
    },
    onError: () => {
      toast.error("Failed to delete prompt")
    }
  })

  const handleSave = () => {
    if (!formData.title || !formData.content) {
      toast.error("Title and content are required")
      return
    }
    updateMutation.mutate()
  }

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this prompt?")) {
      deleteMutation.mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  if (!promptResult) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-destructive">Prompt not found</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/prompt-library')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">Edit Prompt</h1>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Enter prompt title"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Enter a brief description"
              rows={3}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Prompt Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Enter your prompt content"
              rows={10}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use variables like {`{{variable_name}}`} for dynamic content
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <TagInput
              value={formData.tags || []}
              onChange={(tags) => setFormData({ ...formData, tags })}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={formData.visibility}
              onValueChange={(value: PromptVisibility) =>
                setFormData({ ...formData, visibility: value })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Public prompts will be visible to all users after moderation
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Views
              </div>
              <div className="text-2xl font-semibold">
                {promptResult.viewCount}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Uses
              </div>
              <div className="text-2xl font-semibold">
                {promptResult.useCount}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Status
              </div>
              <div className="text-sm font-semibold capitalize">
                {promptResult.moderationStatus}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
