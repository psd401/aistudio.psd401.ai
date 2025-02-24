"use client"

import { useState } from "react"
import { toast } from "sonner"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { SelectMetaPromptingTechnique, SelectAiModel } from "@/db/schema"

interface TechniquesManagerProps {
  initialTechniques: SelectMetaPromptingTechnique[]
  availableModels: SelectAiModel[]
}

export function TechniquesManager({ initialTechniques, availableModels }: TechniquesManagerProps) {
  const [techniques, setTechniques] = useState(initialTechniques)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedTechnique, setSelectedTechnique] = useState<SelectMetaPromptingTechnique | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateTechnique = async (formData: FormData) => {
    const technique = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      type: formData.get("type") as any,
      example: formData.get("example") as string,
      exampleInput: formData.get("exampleInput") as string,
      exampleOutput: formData.get("exampleOutput") as string,
      modelId: parseInt(formData.get("modelId") as string)
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/meta-prompting/techniques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(technique)
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTechniques([...techniques, result.data])
        setIsAddDialogOpen(false)
        toast.success("Technique created successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to create technique")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateTechnique = async (formData: FormData) => {
    if (!selectedTechnique) return

    const updates = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      type: formData.get("type") as any,
      example: formData.get("example") as string,
      exampleInput: formData.get("exampleInput") as string,
      exampleOutput: formData.get("exampleOutput") as string,
      modelId: parseInt(formData.get("modelId") as string)
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/meta-prompting/techniques?id=${selectedTechnique.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTechniques(techniques.map(t => 
          t.id === selectedTechnique.id ? result.data : t
        ))
        setIsEditDialogOpen(false)
        setSelectedTechnique(null)
        toast.success("Technique updated successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update technique")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTechnique = async (technique: SelectMetaPromptingTechnique) => {
    if (!confirm("Are you sure you want to delete this technique?")) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/meta-prompting/techniques?id=${technique.id}`, {
        method: "DELETE"
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTechniques(techniques.filter(t => t.id !== technique.id))
        toast.success("Technique deleted successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to delete technique")
    } finally {
      setIsLoading(false)
    }
  }

  const TechniqueForm = ({ technique }: { technique?: SelectMetaPromptingTechnique }) => (
    <form action={technique ? handleUpdateTechnique : handleCreateTechnique} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input 
          id="name" 
          name="name" 
          defaultValue={technique?.name}
          required 
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Select name="type" defaultValue={technique?.type}>
          <SelectTrigger disabled={isLoading}>
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prompt_generation">Prompt Generation</SelectItem>
            <SelectItem value="iterative_refinement">Iterative Refinement</SelectItem>
            <SelectItem value="feedback">Feedback</SelectItem>
            <SelectItem value="role_reversal">Role Reversal</SelectItem>
            <SelectItem value="bot_to_bot">Bot-to-Bot</SelectItem>
            <SelectItem value="meta_questioning">Meta-Questioning</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="modelId">Model</Label>
        <Select name="modelId" defaultValue={technique?.modelId?.toString()}>
          <SelectTrigger disabled={isLoading}>
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map(model => (
              <SelectItem key={model.id} value={model.id.toString()}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea 
          id="description" 
          name="description" 
          defaultValue={technique?.description}
          required 
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="example">Example</Label>
        <Textarea 
          id="example" 
          name="example" 
          defaultValue={technique?.example}
          required 
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="exampleInput">Example Input (Optional)</Label>
        <Textarea 
          id="exampleInput" 
          name="exampleInput" 
          defaultValue={technique?.exampleInput}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="exampleOutput">Example Output (Optional)</Label>
        <Textarea 
          id="exampleOutput" 
          name="exampleOutput" 
          defaultValue={technique?.exampleOutput}
          disabled={isLoading}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {technique ? "Update" : "Create"} Technique
        </Button>
      </DialogFooter>
    </form>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Meta-Prompting Techniques</CardTitle>
            <CardDescription>
              Manage your meta-prompting techniques
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLoading}>
                <Plus className="mr-2 h-4 w-4" />
                Add Technique
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Technique</DialogTitle>
                <DialogDescription>
                  Create a new meta-prompting technique
                </DialogDescription>
              </DialogHeader>
              <TechniqueForm />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {techniques.map(technique => (
            <Card key={technique.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{technique.name}</CardTitle>
                  <div className="flex gap-2">
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={isLoading}
                          onClick={() => setSelectedTechnique(technique)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      {selectedTechnique?.id === technique.id && (
                        <DialogContent className="max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Technique</DialogTitle>
                            <DialogDescription>
                              Modify this meta-prompting technique
                            </DialogDescription>
                          </DialogHeader>
                          <TechniqueForm technique={selectedTechnique} />
                        </DialogContent>
                      )}
                    </Dialog>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={isLoading}
                      onClick={() => handleDeleteTechnique(technique)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Type:</span>{" "}
                    {technique.type.replace("_", " ")}
                  </div>
                  <div>
                    <span className="font-medium">Model:</span>{" "}
                    {availableModels.find(m => m.id === technique.modelId)?.name || "No model selected"}
                  </div>
                  <div>
                    <span className="font-medium">Description:</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {technique.description}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Example:</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {technique.example}
                    </p>
                  </div>
                  {technique.exampleInput && (
                    <div>
                      <span className="font-medium">Example Input:</span>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {technique.exampleInput}
                      </p>
                    </div>
                  )}
                  {technique.exampleOutput && (
                    <div>
                      <span className="font-medium">Example Output:</span>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {technique.exampleOutput}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
} 