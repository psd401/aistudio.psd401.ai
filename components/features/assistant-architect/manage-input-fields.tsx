"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { addInputFieldAction, deleteInputFieldAction, updateInputFieldAction, reorderInputFieldsAction } from "@/actions/db/assistant-architect-actions"
import { useRouter } from "next/navigation"
import { PlusIcon, GripVertical, Trash2, Pencil } from "lucide-react"
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

interface InputField {
  id: string
  name: string
  fieldType: string
  options: any
  position: number
}

interface ManageInputFieldsProps {
  tool: {
    id: string
    inputFields: InputField[]
  }
  canEdit: boolean
}

export function ManageInputFields({ tool, canEdit }: ManageInputFieldsProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fieldName, setFieldName] = useState("")
  const [fieldType, setFieldType] = useState("text")
  const [fieldOptions, setFieldOptions] = useState("")
  const [editingField, setEditingField] = useState<InputField | null>(null)
  const router = useRouter()

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Parse options if field type is select
      let parsedOptions = null
      if (fieldType === "select" && fieldOptions) {
        try {
          // Split by new lines and trim
          parsedOptions = fieldOptions
            .split("\n")
            .map(option => option.trim())
            .filter(option => option.length > 0)
        } catch (error) {
          toast.error("Invalid options format. Please enter one option per line.")
          setIsLoading(false)
          return
        }
      }

      const result = await addInputFieldAction({
        toolId: tool.id,
        name: fieldName,
        fieldType: fieldType as any,
        options: parsedOptions,
        position: tool.inputFields.length
      })

      if (result.isSuccess) {
        toast.success("Input field added successfully")
        setIsAddDialogOpen(false)
        setFieldName("")
        setFieldType("text")
        setFieldOptions("")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to add input field")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingField) return
    
    setIsLoading(true)

    try {
      // Parse options if field type is select
      let parsedOptions = null
      if (fieldType === "select" && fieldOptions) {
        try {
          // Split by new lines and trim
          parsedOptions = fieldOptions
            .split("\n")
            .map(option => option.trim())
            .filter(option => option.length > 0)
        } catch (error) {
          toast.error("Invalid options format. Please enter one option per line.")
          setIsLoading(false)
          return
        }
      }

      const result = await updateInputFieldAction(editingField.id, {
        name: fieldName,
        fieldType: fieldType as any,
        options: parsedOptions,
      })

      if (result.isSuccess) {
        toast.success("Input field updated successfully")
        setIsEditDialogOpen(false)
        setEditingField(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update input field")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    try {
      const result = await deleteInputFieldAction(fieldId)

      if (result.isSuccess) {
        toast.success("Input field deleted successfully")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to delete input field")
      console.error(error)
    }
  }

  const handleReorder = async () => {
    // TODO: Implement drag and drop reordering
  }

  const openEditDialog = (field: InputField) => {
    setEditingField(field)
    setFieldName(field.name)
    setFieldType(field.fieldType)
    setFieldOptions(field.options ? field.options.join("\n") : "")
    setIsEditDialogOpen(true)
  }

  const renderFieldTypeLabel = (type: string) => {
    switch (type) {
      case "text":
        return "Single Line Text"
      case "textarea":
        return "Multi-line Text"
      case "select":
        return "Dropdown"
      default:
        return type
    }
  }

  return (
    <div className="space-y-4">
      {tool.inputFields.length === 0 ? (
        <Alert>
          <AlertDescription>
            No input fields defined yet. Add input fields to collect information from users.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          {tool.inputFields
            .sort((a, b) => a.position - b.position)
            .map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md"
              >
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <div className="cursor-move text-muted-foreground">
                      <GripVertical size={16} />
                    </div>
                  )}
                  <div>
                    <div className="font-medium">{field.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {renderFieldTypeLabel(field.fieldType)}
                      {field.fieldType === "select" && field.options && (
                        <span> ({field.options.length} options)</span>
                      )}
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(field)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteField(field.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {canEdit && (
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Input Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAddField}>
              <DialogHeader>
                <DialogTitle>Add Input Field</DialogTitle>
                <DialogDescription>
                  Create a new input field for users to provide data.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Field Name</Label>
                  <Input
                    id="name"
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    placeholder="Enter a field name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Field Type</Label>
                  <Select
                    value={fieldType}
                    onValueChange={(value) => setFieldType(value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Single Line Text</SelectItem>
                      <SelectItem value="textarea">Multi-line Text</SelectItem>
                      <SelectItem value="select">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {fieldType === "select" && (
                  <div className="space-y-2">
                    <Label htmlFor="options">Options (one per line)</Label>
                    <Textarea
                      id="options"
                      value={fieldOptions}
                      onChange={(e) => setFieldOptions(e.target.value)}
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                      rows={4}
                      required
                    />
                  </div>
                )}
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
                  {isLoading ? "Adding..." : "Add Field"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canEdit && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <form onSubmit={handleEditField}>
              <DialogHeader>
                <DialogTitle>Edit Input Field</DialogTitle>
                <DialogDescription>
                  Update the input field properties.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Field Name</Label>
                  <Input
                    id="edit-name"
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    placeholder="Enter a field name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Field Type</Label>
                  <Select
                    value={fieldType}
                    onValueChange={(value) => setFieldType(value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Single Line Text</SelectItem>
                      <SelectItem value="textarea">Multi-line Text</SelectItem>
                      <SelectItem value="select">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {fieldType === "select" && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-options">Options (one per line)</Label>
                    <Textarea
                      id="edit-options"
                      value={fieldOptions}
                      onChange={(e) => setFieldOptions(e.target.value)}
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                      rows={4}
                      required
                    />
                  </div>
                )}
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