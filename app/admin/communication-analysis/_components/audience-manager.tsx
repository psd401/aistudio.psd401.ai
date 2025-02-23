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
import { SelectAudience } from "@/types"
import { 
  createAudienceAction, 
  deleteAudienceAction, 
  updateAudienceAction 
} from "@/actions/db/communication-analysis-actions"
import { toast } from "sonner"

interface AudienceManagerProps {
  initialAudiences: SelectAudience[]
}

export default function AudienceManager({ initialAudiences }: AudienceManagerProps) {
  const [audiences, setAudiences] = useState<SelectAudience[]>(initialAudiences)
  const [editingAudience, setEditingAudience] = useState<SelectAudience | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    if (!name) return

    try {
      if (editingAudience) {
        const result = await updateAudienceAction(editingAudience.id, {
          name,
          description
        })
        if (result.isSuccess) {
          setAudiences(audiences.map(a => 
            a.id === editingAudience.id ? result.data : a
          ))
          toast.success("Audience updated successfully")
        } else {
          toast.error(result.message)
        }
      } else {
        const result = await createAudienceAction({
          name,
          description
        })
        if (result.isSuccess) {
          setAudiences([...audiences, result.data])
          toast.success("Audience created successfully")
        } else {
          toast.error(result.message)
        }
      }
      setIsOpen(false)
      setEditingAudience(null)
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this audience?")) return

    try {
      const result = await deleteAudienceAction(id)
      if (result.isSuccess) {
        setAudiences(audiences.filter(a => a.id !== id))
        toast.success("Audience deleted successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Audiences</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Audience
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAudience ? "Edit Audience" : "Add New Audience"}
              </DialogTitle>
              <DialogDescription>
                Create or modify an audience for communication analysis
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingAudience?.name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingAudience?.description || ""}
                />
              </div>
              <DialogFooter>
                <Button type="submit">
                  {editingAudience ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {audiences.map(audience => (
          <Card key={audience.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{audience.name}</span>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingAudience(audience)
                      setIsOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(audience.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              {audience.description && (
                <CardDescription>{audience.description}</CardDescription>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
} 