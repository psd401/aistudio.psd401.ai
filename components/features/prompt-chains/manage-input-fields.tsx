"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InputFieldForm } from "@/components/features/prompt-chains/input-field-form"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { Trash2 } from "lucide-react"
import { deleteInputFieldAction } from "@/actions/db/prompt-chains-actions"
import type { PromptChainToolWithRelations } from "@/types"

interface ManageInputFieldsProps {
  tool: PromptChainToolWithRelations
  canEdit: boolean
}

export function ManageInputFields({ tool, canEdit }: ManageInputFieldsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  
  // Sort input fields by position
  const sortedFields = [...(tool.inputFields || [])].sort(
    (a, b) => a.position - b.position
  )

  const handleSuccess = () => {
    router.refresh()
  }

  const handleDeleteField = async (fieldId: string) => {
    try {
      setIsDeleting(fieldId)
      const result = await deleteInputFieldAction(fieldId)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Input field deleted successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete input field",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Input Fields</h3>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add Input Field</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Input Field</DialogTitle>
              </DialogHeader>
              <InputFieldForm 
                toolId={tool.id} 
                currentPosition={sortedFields.length}
                onSuccess={() => {
                  setIsOpen(false)
                  handleSuccess()
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sortedFields.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No input fields have been added yet. 
              {canEdit && " Click 'Add Input Field' to create one."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedFields.map((field) => (
            <Card key={field.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{field.name}</CardTitle>
                  <Badge variant="outline">{field.position + 1}</Badge>
                </div>
                <CardDescription>
                  Type: {field.fieldType.replace("_", " ")}
                </CardDescription>
                <div className="mt-1 font-mono text-xs text-muted-foreground">ID: {field.id}</div>
              </CardHeader>
              <CardContent>
                {field.options && field.options.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Options:</p>
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((option, i) => (
                        <Badge key={i} variant="secondary">{option.label}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {canEdit && (
                  <div className="flex justify-end mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      onClick={() => handleDeleteField(field.id)}
                      disabled={isDeleting === field.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {isDeleting === field.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
} 