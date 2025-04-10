"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import type { PromptChainToolWithRelations } from "@/types"

interface PromptChainListProps {
  tools: PromptChainToolWithRelations[]
  showCreateButton?: boolean
  onSearch?: (query: string) => void
}

export function PromptChainList({
  tools,
  showCreateButton = true,
  onSearch
}: PromptChainListProps) {
  const [searchQuery, setSearchQuery] = useState("")

  function handleSearch(query: string) {
    setSearchQuery(query)
    if (onSearch) {
      onSearch(query)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Prompt Chain Tools
          </h2>
          <p className="text-sm text-muted-foreground">
            Browse and use available prompt chain tools
          </p>
        </div>
        {showCreateButton && (
          <Link href="/utilities/prompt-chains/create">
            <Button>Create Tool</Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Tool List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.id}
            href={`/utilities/prompt-chains/${tool.id}`}
            className="transition-colors"
          >
            <Card>
              <CardHeader>
                <CardTitle>{tool.name}</CardTitle>
                <CardDescription>
                  {tool.description || "No description provided"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {tool.inputFields?.length || 0} Inputs
                    </Badge>
                    <Badge variant="outline">
                      {tool.prompts?.length || 0} Prompts
                    </Badge>
                    {tool.isParallel && (
                      <Badge variant="secondary">Parallel</Badge>
                    )}
                    {tool.status && (
                      <Badge 
                        variant={
                          tool.status === "approved" ? "default" :
                          tool.status === "draft" ? "outline" :
                          tool.status === "pending_approval" ? "secondary" :
                          "destructive"
                        }
                      >
                        {tool.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Created{" "}
                    {new Date(tool.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {tools.length === 0 && (
          <div className="col-span-full">
            <Card>
              <CardHeader>
                <CardTitle>No Tools Found</CardTitle>
                <CardDescription>
                  {searchQuery
                    ? "No tools match your search query"
                    : "No prompt chain tools have been created yet"}
                </CardDescription>
              </CardHeader>
              {showCreateButton && (
                <CardContent>
                  <Link href="/utilities/prompt-chains/create">
                    <Button variant="secondary">Create Your First Tool</Button>
                  </Link>
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
} 