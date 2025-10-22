"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { listPrompts } from "@/actions/prompt-library.actions"
import type { PromptListItem } from "@/lib/prompt-library/types"
import { PromptGalleryCard } from "./prompt-gallery-card"
import { SearchFilterBar } from "./search-filter-bar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PublicGalleryClientProps {
  initialQuery: string
  initialTags: string[]
  initialSort: 'created' | 'usage' | 'views'
  initialPage: number
}

export function PublicGalleryClient({
  initialQuery,
  initialTags,
  initialSort,
  initialPage
}: PublicGalleryClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [prompts, setPrompts] = useState<PromptListItem[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags)
  const [sortBy, setSortBy] = useState<'created' | 'usage' | 'views'>(initialSort)

  useEffect(() => {
    loadPrompts()
  }, [initialQuery, initialPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPrompts = async () => {
    setLoading(true)
    setError(null)

    const result = await listPrompts({
      visibility: 'public',
      search: initialQuery || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      sort: sortBy,
      page: currentPage,
      limit: 24
    })

    if (result.isSuccess) {
      setPrompts(result.data.prompts)
      setTotal(result.data.total)
      setHasMore(result.data.hasMore)
    } else {
      setError(result.message || "Failed to load prompts")
    }

    setLoading(false)
  }

  const handleTagChange = (tags: string[]) => {
    setSelectedTags(tags)
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (tags.length > 0) {
        params.set("tags", tags.join(","))
      } else {
        params.delete("tags")
      }
      params.delete("page") // Reset to page 1
      router.push(`/prompt-library/public?${params.toString()}`)
    })
  }

  const handleSortChange = (sort: 'created' | 'usage' | 'views') => {
    setSortBy(sort)
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("sort", sort)
      params.delete("page") // Reset to page 1
      router.push(`/prompt-library/public?${params.toString()}`)
    })
  }

  const handleLoadMore = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      const nextPage = currentPage + 1
      params.set("page", String(nextPage))
      setCurrentPage(nextPage)
      router.push(`/prompt-library/public?${params.toString()}`)
    })
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <SearchFilterBar
        selectedTags={selectedTags}
        onTagsChange={handleTagChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        totalCount={total}
      />

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-lg" />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl text-muted-foreground mb-2">
            No prompts found
          </p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {prompts.map((prompt) => (
              <PromptGalleryCard key={prompt.id} prompt={prompt} />
            ))}
          </div>

          {/* Pagination */}
          {hasMore && (
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isPending}
                size="lg"
              >
                {isPending ? "Loading..." : "Load More Prompts"}
              </Button>
            </div>
          )}

          {/* Results Info */}
          <div className="text-center text-sm text-muted-foreground">
            Showing {prompts.length} of {total} prompts
            {currentPage > 1 && ` (Page ${currentPage})`}
          </div>
        </>
      )}
    </div>
  )
}
