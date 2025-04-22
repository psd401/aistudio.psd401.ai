"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit, Eye, Clock, Check, X, Play, Trash2 } from "lucide-react"
import { AssistantArchitectWithRelations } from "@/types"
import { useToast } from "@/components/ui/use-toast"
import { deleteAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"
import { useRouter } from "next/navigation"

interface AssistantArchitectListProps {
  tools: AssistantArchitectWithRelations[]
}

export function AssistantArchitectList({ tools }: AssistantArchitectListProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  if (!tools?.length) {
    return (
      <div className="text-center text-muted-foreground">
        No assistants found.
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Draft</Badge>
      case "pending_approval":
        return <Badge variant="warning"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
      case "approved":
        return <Badge variant="success"><Check className="h-3 w-3 mr-1" /> Approved</Badge>
      case "rejected":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" /> Rejected</Badge>
      default:
        return null
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(id)
      const result = await deleteAssistantArchitectAction(id)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Assistant architect deleted successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete assistant architect",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.map((tool) => (
        <Card key={tool.id} className="flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-xl">{tool.name}</CardTitle>
              {getStatusBadge(tool.status)}
            </div>
            {tool.description && (
              <CardDescription className="line-clamp-2">
                {tool.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex-grow">
            <div className="text-sm">
              <p>
                <span className="font-medium">Inputs:</span> {tool.inputFields?.length || 0}
              </p>
              <p>
                <span className="font-medium">Prompts:</span> {tool.prompts?.length || 0}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/utilities/assistant-architect/${tool.id}/edit`}>
                <Eye className="h-4 w-4 mr-1" /> 
                View
              </Link>
            </Button>
            
            <div className="flex gap-2">
              {tool.status === "approved" && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/tools/assistant-architect/${tool.id}`}>
                    <Play className="h-4 w-4 mr-1" />
                    Execute
                  </Link>
                </Button>
              )}
              {(tool.status === "draft" || tool.status === "rejected") && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleDelete(tool.id)}
                  disabled={isDeleting === tool.id}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {isDeleting === tool.id ? "Deleting..." : "Delete"}
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
} 