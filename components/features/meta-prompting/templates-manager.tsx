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
import { SelectMetaPromptingTemplate, SelectMetaPromptingTechnique } from "@/db/schema"

interface TemplatesManagerProps {
  initialTemplates: SelectMetaPromptingTemplate[]
  techniques: SelectMetaPromptingTechnique[]
}

export function TemplatesManager({ initialTemplates, techniques }: TemplatesManagerProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<SelectMetaPromptingTemplate | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateTemplate = async (formData: FormData) => {
    const template = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      techniqueId: formData.get("techniqueId") as string,
      template: formData.get("template") as string,
      variables: formData.get("variables") ? 
        JSON.parse(formData.get("variables") as string) : 
        null
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/meta-prompting/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTemplates([...templates, result.data])
        setIsAddDialogOpen(false)
        toast.success("Template created successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to create template")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateTemplate = async (formData: FormData) => {
    if (!selectedTemplate) return

    const updates = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      techniqueId: formData.get("techniqueId") as string,
      template: formData.get("template") as string,
      variables: formData.get("variables") ? 
        JSON.parse(formData.get("variables") as string) : 
        null
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/meta-prompting/templates?id=${selectedTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTemplates(templates.map(t => 
          t.id === selectedTemplate.id ? result.data : t
        ))
        setIsEditDialogOpen(false)
        setSelectedTemplate(null)
        toast.success("Template updated successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update template")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTemplate = async (template: SelectMetaPromptingTemplate) => {
    if (!confirm("Are you sure you want to delete this template?")) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/meta-prompting/templates?id=${template.id}`, {
        method: "DELETE"
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setTemplates(templates.filter(t => t.id !== template.id))
        toast.success("Template deleted successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to delete template")
    } finally {
      setIsLoading(false)
    }
  }

  const TemplateForm = ({ template }: { template?: SelectMetaPromptingTemplate }) => (
    <form action={template ? handleUpdateTemplate : handleCreateTemplate} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input 
          id="name" 
          name="name" 
          defaultValue={template?.name}
          required 
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="techniqueId">Technique</Label>
        <Select name="techniqueId" defaultValue={template?.techniqueId}>
          <SelectTrigger disabled={isLoading}>
            <SelectValue placeholder="Select a technique" />
          </SelectTrigger>
          <SelectContent>
            {techniques.map(technique => (
              <SelectItem key={technique.id} value={technique.id}>
                {technique.name}
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
          defaultValue={template?.description}
          required 
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="template">Template</Label>
        <Textarea 
          id="template" 
          name="template" 
          defaultValue={template?.template}
          required 
          disabled={isLoading}
          className="font-mono"
          placeholder="Enter your template with variables like {{variable_name}}"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="variables">Variables (Optional JSON)</Label>
        <Textarea 
          id="variables" 
          name="variables" 
          defaultValue={template?.variables ? JSON.stringify(template.variables, null, 2) : ""}
          disabled={isLoading}
          className="font-mono"
          placeholder='{"variable_name": "description"}'
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {template ? "Update" : "Create"} Template
        </Button>
      </DialogFooter>
    </form>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Meta-Prompting Templates</CardTitle>
            <CardDescription>
              Manage your meta-prompting templates
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLoading}>
                <Plus className="mr-2 h-4 w-4" />
                Add Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Template</DialogTitle>
                <DialogDescription>
                  Create a new meta-prompting template
                </DialogDescription>
              </DialogHeader>
              <TemplateForm />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {templates.map(template => {
            const technique = techniques.find(t => t.id === template.techniqueId)
            return (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{template.name}</CardTitle>
                    <div className="flex gap-2">
                      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                            onClick={() => setSelectedTemplate(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        {selectedTemplate?.id === template.id && (
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Template</DialogTitle>
                              <DialogDescription>
                                Modify this meta-prompting template
                              </DialogDescription>
                            </DialogHeader>
                            <TemplateForm template={selectedTemplate} />
                          </DialogContent>
                        )}
                      </Dialog>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        onClick={() => handleDeleteTemplate(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">Technique:</span>{" "}
                      {technique?.name || "Unknown technique"}
                    </div>
                    <div>
                      <span className="font-medium">Description:</span>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Template:</span>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm">
                        {template.template}
                      </pre>
                    </div>
                    {template.variables && (
                      <div>
                        <span className="font-medium">Variables:</span>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm">
                          {JSON.stringify(template.variables, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
} 