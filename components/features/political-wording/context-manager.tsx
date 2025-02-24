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
import { Plus, Pencil, Trash2 } from "lucide-react"
import { SelectPoliticalContext } from "@/types"
import { 
  createPoliticalContextAction, 
  deletePoliticalContextAction, 
  updatePoliticalContextAction 
} from "@/actions/db/political-wording-actions"
import { toast } from "sonner"

interface ContextManagerProps {
  initialContexts: SelectPoliticalContext[]
}

export function ContextManager({ initialContexts }: ContextManagerProps) {
  const [contexts, setContexts] = useState<SelectPoliticalContext[]>(initialContexts)
  const [isOpen, setIsOpen] = useState(false)
  const [editingContext, setEditingContext] = useState<SelectPoliticalContext | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    content: ""
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      content: ""
    })
    setEditingContext(null)
    setIsOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingContext) {
        const response = await updatePoliticalContextAction(editingContext.id, formData)
        if (response.isSuccess) {
          setContexts(contexts.map(c => c.id === editingContext.id ? response.data : c))
          toast.success("Context updated successfully")
        } else {
          toast.error(response.message)
        }
      } else {
        const response = await createPoliticalContextAction(formData)
        if (response.isSuccess) {
          setContexts([...contexts, response.data])
          toast.success("Context created successfully")
        } else {
          toast.error(response.message)
        }
      }
      resetForm()
    } catch (error) {
      toast.error("Failed to save context")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await deletePoliticalContextAction(id)
      if (response.isSuccess) {
        setContexts(contexts.filter(c => c.id !== id))
        toast.success("Context deleted successfully")
      } else {
        toast.error(response.message)
      }
    } catch (error) {
      toast.error("Failed to delete context")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Contexts</h2>
          <p className="text-muted-foreground">
            Manage contexts for political wording analysis
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Context
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingContext ? "Edit Context" : "Add Context"}
                </DialogTitle>
                <DialogDescription>
                  {editingContext
                    ? "Edit the context details below"
                    : "Add a new context for political wording analysis"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter context name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter context description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Enter context content"
                    rows={5}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingContext ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contexts.map(context => (
          <Card key={context.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{context.name}</span>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingContext(context)
                      setFormData({
                        name: context.name,
                        description: context.description || "",
                        content: context.content
                      })
                      setIsOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(context.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              {context.description && (
                <CardDescription>{context.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap">{context.content}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 