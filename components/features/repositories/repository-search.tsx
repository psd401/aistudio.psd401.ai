"use client"

import { useState } from "react"
import { type RepositoryItem, type RepositoryItemChunk } from "@/actions/repositories/repository-items.actions"
import { searchRepositoryItems } from "@/actions/repositories/repository-items.actions"
import { useAction } from "@/lib/hooks/use-action"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, FileText, Link, Type, Loader2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface RepositorySearchProps {
  repositoryId: number
}

export function RepositorySearch({ repositoryId }: RepositorySearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{
    items: RepositoryItem[]
    chunks: (RepositoryItemChunk & { item_name: string })[]
  } | null>(null)

  const { execute: executeSearch, isPending: isLoading } = useAction(
    (params: { repositoryId: number; query: string }) => 
      searchRepositoryItems(params.repositoryId, params.query)
  )

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    const result = await executeSearch({ repositoryId, query })
    if (result.isSuccess && result.data) {
      setResults(result.data as { items: RepositoryItem[]; chunks: (RepositoryItemChunk & { item_name: string })[] })
    }
  }

  function getItemIcon(type: string) {
    switch (type) {
      case "document":
        return <FileText className="h-4 w-4" />
      case "url":
        return <Link className="h-4 w-4" />
      case "text":
        return <Type className="h-4 w-4" />
      default:
        return null
    }
  }

  function highlightMatch(text: string, query: string) {
    const regex = new RegExp(`(${query})`, "gi")
    const parts = text.split(regex)
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-900">
          {part}
        </mark>
      ) : (
        <span key={index}>{part}</span>
      )
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Repository</CardTitle>
        <CardDescription>
          Search for content within this repository
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            placeholder="Search for documents, URLs, or text content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </form>

        {results && (
          <div className="space-y-6">
            {results.items.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Matching Items</h3>
                <div className="space-y-2">
                  {results.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      {getItemIcon(item.type)}
                      <div className="flex-1">
                        <div className="font-medium">
                          {highlightMatch(item.name, query)}
                        </div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {item.type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.items.length > 0 && results.chunks.length > 0 && (
              <Separator />
            )}

            {results.chunks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Content Matches</h3>
                <div className="space-y-3">
                  {results.chunks.map((chunk) => (
                    <div key={chunk.id} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          {chunk.item_name}
                        </div>
                        <Badge variant="outline">
                          Chunk {chunk.chunk_index + 1}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-3">
                        {highlightMatch(chunk.content, query)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.items.length === 0 && results.chunks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No results found for &quot;{query}&quot;
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}