"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit, Eye, Clock, Check, X, Play } from "lucide-react"
import { AssistantArchitectWithRelations } from "@/types"

interface AssistantArchitectListProps {
  tools: AssistantArchitectWithRelations[]
}

export function AssistantArchitectList({ tools }: AssistantArchitectListProps) {
  if (!tools?.length) {
    return <p className="text-muted-foreground italic">No Assistant Architects found.</p>
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-100">Draft</Badge>
      case "pending_approval":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending Approval</Badge>
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-800">Approved</Badge>
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-800">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "draft":
        return <Edit className="h-4 w-4 mr-1" />
      case "pending_approval":
        return <Clock className="h-4 w-4 mr-1" />
      case "approved":
        return <Check className="h-4 w-4 mr-1" />
      case "rejected":
        return <X className="h-4 w-4 mr-1" />
      default:
        return null
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
              <p>
                <span className="font-medium">Parallel Mode:</span> {tool.isParallel ? "Yes" : "No"}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/utilities/assistant-architect/${tool.id}`}>
                <Eye className="h-4 w-4 mr-1" /> 
                View
              </Link>
            </Button>
            
            {tool.status === "approved" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/tools/assistant-architect/${tool.id}`}>
                  <Play className="h-4 w-4 mr-1" />
                  Execute
                </Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
} 