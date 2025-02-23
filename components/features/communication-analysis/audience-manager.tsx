"use client"

import { useEffect, useState } from "react"
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
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { SelectAudience } from "@/types"
import { toast } from "sonner"

interface AudienceManagerProps {
  initialAudiences: SelectAudience[]
}

export function AudienceManager({ initialAudiences }: AudienceManagerProps) {
  const [audiences, setAudiences] = useState<SelectAudience[]>(initialAudiences)
  const [editingAudience, setEditingAudience] = useState<SelectAudience | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("persona") as string

    if (!name) return

    setIsLoading(true)
    try {
      if (editingAudience) {
        const response = await fetch("/api/communication-analysis/audiences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingAudience.id,
            name,
            description
          })
        })
        const result = await response.json()
        
        if (result.isSuccess) {
          setAudiences(audiences.map(a => 
            a.id === editingAudience.id ? result.data : a
          ))
          toast.success("Audience updated successfully")
        } else {
          toast.error(result.message)
        }
      } else {
        const response = await fetch("/api/communication-analysis/audiences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description
          })
        })
        const result = await response.json()
        
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
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this audience?")) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/communication-analysis/audiences?id=${id}`, {
        method: "DELETE"
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setAudiences(audiences.filter(a => a.id !== id))
        toast.success("Audience deleted successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Audiences</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button disabled={isLoading}>
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
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="persona">Audience Persona</Label>
                <Textarea
                  id="persona"
                  name="persona"
                  defaultValue={editingAudience?.description || ""}
                  disabled={isLoading}
                  className="min-h-[200px]"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isLoading}>
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
                    disabled={isLoading}
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
                    disabled={isLoading}
                    onClick={() => handleDelete(audience.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              {audience.description && (
                <div>
                  <div 
                    className={`prose-sm mt-2 ${!expandedCards[audience.id] ? "line-clamp-3" : ""}`}
                  >
                    {audience.description}
                  </div>
                  {audience.description.length > 150 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => toggleExpand(audience.id)}
                    >
                      {expandedCards[audience.id] ? (
                        <ChevronUp className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      )}
                      {expandedCards[audience.id] ? "Show Less" : "Show More"}
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
} 