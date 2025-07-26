"use client"

import { useState } from "react"
import { searchRepository } from "@/actions/repositories/search.actions"
import { useAction } from "@/lib/hooks/use-action"
import { SearchResults } from "./search-results"
import { SearchResult } from "@/lib/repositories/search-service"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Search, Loader2, Settings2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface RepositorySearchProps {
  repositoryId: number
}

export function RepositorySearch({ repositoryId }: RepositorySearchProps) {
  const [query, setQuery] = useState("")
  const [searchType, setSearchType] = useState<'hybrid' | 'vector' | 'keyword'>('hybrid')
  const [vectorWeight, setVectorWeight] = useState([0.7])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  const { execute: executeSearch, isPending: isLoading } = useAction(searchRepository)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    const result = await executeSearch({
      query,
      repositoryId,
      searchType,
      vectorWeight: vectorWeight[0],
      limit: 20
    })

    if (result.isSuccess && result.data) {
      setResults(result.data as SearchResult[])
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Repository</CardTitle>
        <CardDescription>
          Search for content within this repository using AI-powered semantic search
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2">
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
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Advanced Options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="space-y-3">
                <Label>Search Type</Label>
                <RadioGroup value={searchType} onValueChange={(value: string) => setSearchType(value as 'hybrid' | 'vector' | 'keyword')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="hybrid" id="hybrid" />
                    <Label htmlFor="hybrid" className="font-normal cursor-pointer">
                      Hybrid Search (Recommended)
                      <span className="block text-xs text-muted-foreground">
                        Combines semantic understanding with keyword matching
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="vector" id="vector" />
                    <Label htmlFor="vector" className="font-normal cursor-pointer">
                      Semantic Search
                      <span className="block text-xs text-muted-foreground">
                        Uses AI to understand meaning and context
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="keyword" id="keyword" />
                    <Label htmlFor="keyword" className="font-normal cursor-pointer">
                      Keyword Search
                      <span className="block text-xs text-muted-foreground">
                        Traditional text matching
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {searchType === 'hybrid' && (
                <div className="space-y-3">
                  <Label>
                    Semantic Weight: {Math.round(vectorWeight[0] * 100)}%
                    <span className="text-xs text-muted-foreground ml-2">
                      (Keyword: {Math.round((1 - vectorWeight[0]) * 100)}%)
                    </span>
                  </Label>
                  <Slider
                    value={vectorWeight}
                    onValueChange={setVectorWeight}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </form>

        {results.length > 0 && (
          <div className="mt-6">
            <SearchResults results={results} query={query} isLoading={isLoading} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}