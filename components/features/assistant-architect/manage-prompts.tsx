"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { addPromptAction, deletePromptAction, updatePromptAction, updatePromptPositionAction } from "@/actions/db/assistant-architect-actions"
import { useRouter } from "next/navigation"
import { PlusIcon, GripVertical, Trash2, Pencil, ArrowUp, ArrowDown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"

interface Prompt {
  id: string
  name: string
  content: string
  systemContext: string | null
  modelId: number | null
  position: number
  inputMapping?: Record<string, string> | null
}

interface AIModel {
  id: number
  provider: string
  name: string
  modelId: string
}

interface ManagePromptsProps {
  tool: {
    id: string
    prompts: Prompt[]
    inputFields?: { id: string; name: string }[]
  }
  canEdit: boolean
}

export function ManagePrompts({ tool, canEdit }: ManagePromptsProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [promptName, setPromptName] = useState("")
  const [promptContent, setPromptContent] = useState("")
  const [systemContext, setSystemContext] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const router = useRouter()

  // Hardcoded models for now - in a real implementation, these would be fetched from the API
  const models: AIModel[] = [
    { id: 1, provider: "openai", name: "GPT-4", modelId: "gpt-4" },
    { id: 2, provider: "openai", name: "GPT-3.5 Turbo", modelId: "gpt-3.5-turbo" },
    { id: 3, provider: "anthropic", name: "Claude", modelId: "claude-instant-1" }
  ]

  const handleAddPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await addPromptAction({
        toolId: tool.id,
        name: promptName,
        content: promptContent,
        systemContext: systemContext || null,
        modelId: modelId ? parseInt(modelId) : null,
        position: tool.prompts.length,
        inputMapping: null
      })

      if (result.isSuccess) {
        toast.success("Prompt added successfully")
        setIsAddDialogOpen(false)
        setPromptName("")
        setPromptContent("")
        setSystemContext("")
        setModelId(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to add prompt")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPrompt) return
    
    setIsLoading(true)

    try {
      const result = await updatePromptAction(editingPrompt.id, {
        name: promptName,
        content: promptContent,
        systemContext: systemContext || null,
        modelId: modelId ? parseInt(modelId) : null
      })

      if (result.isSuccess) {
        toast.success("Prompt updated successfully")
        setIsEditDialogOpen(false)
        setEditingPrompt(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update prompt")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePrompt = async (promptId: string) => {
    try {
      const result = await deletePromptAction(promptId)

      if (result.isSuccess) {
        toast.success("Prompt deleted successfully")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to delete prompt")
      console.error(error)
    }
  }

  const handleMovePrompt = async (promptId: string, direction: "up" | "down") => {
    try {
      const result = await updatePromptPositionAction(promptId, direction)

      if (result.isSuccess) {
        toast.success("Prompt position updated")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update prompt position")
      console.error(error)
    }
  }

  const openEditDialog = (prompt: Prompt) => {
    setEditingPrompt(prompt)
    setPromptName(prompt.name)
    setPromptContent(prompt.content)
    setSystemContext(prompt.systemContext || "")
    setModelId(prompt.modelId ? prompt.modelId.toString() : null)
    setIsEditDialogOpen(true)
  }

  const getModelName = (modelId: number | null) => {
    if (!modelId) return "None"
    const model = models.find(m => m.id === modelId)
    return model ? model.name : "Unknown"
  }

  const sortedPrompts = [...tool.prompts].sort((a, b) => a.position - b.position)

  return (
    <div className="space-y-4">
      {sortedPrompts.length === 0 ? (
        <Alert>
          <AlertDescription>
            No prompts defined yet. Add prompts to define the behavior of your Assistant Architect.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          {sortedPrompts.map((prompt, index) => (
            <div
              key={prompt.id}
              className="p-4 bg-muted rounded-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{prompt.name}</div>
                {canEdit && (
                  <div className="flex gap-2">
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMovePrompt(prompt.id, "up")}
                      >
                        <ArrowUp size={16} />
                      </Button>
                    )}
                    {index < sortedPrompts.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMovePrompt(prompt.id, "down")}
                      >
                        <ArrowDown size={16} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(prompt)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePrompt(prompt.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Model: {getModelName(prompt.modelId)}
              </div>
              <div className="text-sm">
                <div className="font-medium mt-2">Content:</div>
                <div className="whitespace-pre-wrap bg-background p-2 rounded text-xs mt-1">
                  {prompt.content}
                </div>
                {prompt.systemContext && (
                  <>
                    <div className="font-medium mt-2">System Context:</div>
                    <div className="whitespace-pre-wrap bg-background p-2 rounded text-xs mt-1">
                      {prompt.systemContext}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Prompt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleAddPrompt}>
              <DialogHeader>
                <DialogTitle>Add Prompt</DialogTitle>
                <DialogDescription>
                  Create a new prompt for your Assistant Architect.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Prompt Name</Label>
                  <Input
                    id="name"
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    placeholder="Enter a prompt name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">AI Model</Label>
                  <Select
                    value={modelId || ""}
                    onValueChange={(value) => setModelId(value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an AI model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.id} value={model.id.toString()}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Prompt Content</Label>
                  <Textarea
                    id="content"
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    placeholder="Enter your prompt content. Use ${variableName} for dynamic values."
                    rows={5}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="systemContext">System Context (Optional)</Label>
                  <Textarea
                    id="systemContext"
                    value={systemContext}
                    onChange={(e) => setSystemContext(e.target.value)}
                    placeholder="Enter system instructions for the AI model."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add Prompt"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canEdit && editingPrompt && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleEditPrompt}>
              <DialogHeader>
                <DialogTitle>Edit Prompt</DialogTitle>
                <DialogDescription>
                  Update the prompt configuration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Prompt Name</Label>
                  <Input
                    id="edit-name"
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    placeholder="Enter a prompt name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-model">AI Model</Label>
                  <Select
                    value={modelId || ""}
                    onValueChange={(value) => setModelId(value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an AI model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.id} value={model.id.toString()}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-content">Prompt Content</Label>
                  <Textarea
                    id="edit-content"
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    placeholder="Enter your prompt content. Use ${variableName} for dynamic values."
                    rows={5}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-systemContext">System Context (Optional)</Label>
                  <Textarea
                    id="edit-systemContext"
                    value={systemContext}
                    onChange={(e) => setSystemContext(e.target.value)}
                    placeholder="Enter system instructions for the AI model."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
} 