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
    return (
      <div className="text-center text-muted-foreground">
        No Assistant Architects found.
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