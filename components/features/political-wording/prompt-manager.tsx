"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { SelectPoliticalPrompt, SelectPoliticalContext, SelectAiModel } from "@/types"
import { 
  createPoliticalPromptAction, 
  deletePoliticalPromptAction, 
  updatePoliticalPromptAction 
} from "@/actions/db/political-wording-actions"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"

interface PromptManagerProps {
  initialPrompts: SelectPoliticalPrompt[]
  contexts: SelectPoliticalContext[]
  models: SelectAiModel[]
}

export function PromptManager({ initialPrompts, contexts, models }: PromptManagerProps) {
  const [prompts, setPrompts] = useState<SelectPoliticalPrompt[]>(initialPrompts)
  const [isOpen, setIsOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SelectPoliticalPrompt | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    description: "",
    stage: "initial" as "initial" | "context" | "synthesis",
    modelId: undefined as number | undefined,
    contextId: undefined as string | undefined,
    usesLatimer: false
  })

  const resetForm = () => {
    setFormData({
      name: "",
      content: "",
      description: "",
      stage: "initial",
      modelId: undefined,
      contextId: undefined,
      usesLatimer: false
    })
    setEditingPrompt(null)
    setIsOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name) {
      toast.error("Please enter a name")
      return
    }

    if (!formData.content) {
      toast.error("Please enter content")
      return
    }

    if (!formData.usesLatimer && !formData.modelId) {
      toast.error("Please select a model")
      return
    }

    if (formData.stage === "context" && !formData.contextId) {
      toast.error("Please select a context for context stage prompts")
      return
    }

    try {
      if (editingPrompt) {
        const response = await updatePoliticalPromptAction(editingPrompt.id, formData)
        if (response.isSuccess) {
          setPrompts(prompts.map(p => p.id === editingPrompt.id ? response.data : p))
          toast.success("Prompt updated successfully")
        } else {
          toast.error(response.message)
        }
      } else {
        const response = await createPoliticalPromptAction(formData)
        if (response.isSuccess) {
          setPrompts([...prompts, response.data])
          toast.success("Prompt created successfully")
        } else {
          toast.error(response.message)
        }
      }
      resetForm()
    } catch (error) {
      toast.error("Failed to save prompt")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await deletePoliticalPromptAction(id)
      if (response.isSuccess) {
        setPrompts(prompts.filter(p => p.id !== id))
        toast.success("Prompt deleted successfully")
      } else {
        toast.error(response.message)
      }
    } catch (error) {
      toast.error("Failed to delete prompt")
    }
  }

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "initial":
        return "Initial Analysis"
      case "context":
        return "Context Analysis"
      case "synthesis":
        return "Final Synthesis"
      default:
        return stage
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Prompts</h2>
          <p className="text-muted-foreground">
            Manage prompts for political wording analysis stages
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Prompt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingPrompt ? "Edit Prompt" : "Add Prompt"}
                </DialogTitle>
                <DialogDescription>
                  {editingPrompt
                    ? "Edit the prompt details below"
                    : "Add a new prompt for political wording analysis"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Stage</Label>
                  <Select
                    value={formData.stage}
                    onValueChange={(value: "initial" | "context" | "synthesis") =>
                      setFormData({ ...formData, stage: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">Initial Analysis</SelectItem>
                      <SelectItem value="context">Context Analysis</SelectItem>
                      <SelectItem value="synthesis">Final Synthesis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.stage === "initial" && (
                  <div className="space-y-2">
                    <Label>Use Latimer.ai</Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={formData.usesLatimer}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, usesLatimer: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        Use Latimer.ai for initial analysis
                      </span>
                    </div>
                  </div>
                )}

                {(!formData.usesLatimer || formData.stage !== "initial") && (
                  <div className="space-y-2">
                    <Label htmlFor="model">AI Model</Label>
                    <Select
                      value={formData.modelId?.toString()}
                      onValueChange={(value) =>
                        setFormData({ ...formData, modelId: parseInt(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select AI model" />
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
                )}

                {formData.stage === "context" && (
                  <div className="space-y-2">
                    <Label htmlFor="context">Context</Label>
                    <Select
                      value={formData.contextId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, contextId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select context" />
                      </SelectTrigger>
                      <SelectContent>
                        {contexts.map(context => (
                          <SelectItem key={context.id} value={context.id}>
                            {context.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter prompt name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter prompt description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Enter prompt content"
                    rows={5}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPrompt ? "Update Prompt" : "Add Prompt"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {prompts.map(prompt => (
          <Card key={prompt.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span>{prompt.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {getStageLabel(prompt.stage)}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingPrompt(prompt)
                      setFormData({
                        name: prompt.name,
                        content: prompt.content,
                        description: prompt.description || "",
                        stage: prompt.stage,
                        modelId: prompt.modelId,
                        contextId: prompt.contextId,
                        usesLatimer: prompt.usesLatimer
                      })
                      setIsOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(prompt.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              <div className="flex flex-col gap-1">
                {prompt.usesLatimer ? (
                  <div className="text-sm font-medium">Using Latimer.ai</div>
                ) : (
                  prompt.modelId && (
                    <div className="text-sm font-medium">
                      Model: {models.find(m => m.id === prompt.modelId)?.name}
                    </div>
                  )
                )}
                {prompt.contextId && (
                  <div className="text-sm font-medium">
                    Context: {contexts.find(c => c.id === prompt.contextId)?.name}
                  </div>
                )}
                {prompt.description && (
                  <CardDescription>{prompt.description}</CardDescription>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap">{prompt.content}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 