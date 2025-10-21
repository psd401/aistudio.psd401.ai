"use client"

import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { listPrompts } from "@/actions/prompt-library.actions"
import { usePromptLibraryStore } from "@/lib/stores/prompt-library-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  LayoutGrid,
  List,
  Plus,
  Search
} from "lucide-react"
import { useDebounce } from "use-debounce"
import { useHotkeys } from "react-hotkeys-hook"
import { PromptCard } from "./_components/prompt-card"
import { PromptListItem } from "./_components/prompt-list-item"
import { SearchFilterBar } from "./_components/search-filter-bar"
import { BulkActionsBar } from "./_components/bulk-actions-bar"
import { EmptyState } from "./_components/empty-state"
import { useRouter } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function PromptLibraryPage() {
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const {
    viewMode,
    setViewMode,
    searchQuery,
    selectedTags,
    visibilityFilter,
    sortBy,
    selectedPrompts,
    clearSelection
  } = usePromptLibraryStore()

  const [debouncedSearch] = useDebounce(searchQuery, 300)

  // Fetch prompts with React Query
  const {
    data: result,
    isLoading,
    error
  } = useQuery({
    queryKey: [
      'prompts',
      debouncedSearch,
      selectedTags,
      visibilityFilter,
      sortBy
    ],
    queryFn: async () => {
      const response = await listPrompts({
        search: debouncedSearch || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        sort: sortBy,
        page: 1,
        limit: 100
      })

      if (!response.isSuccess) {
        throw new Error(response.message)
      }

      return response.data
    }
  })

  const prompts = result?.prompts || []
  const selectedCount = selectedPrompts.size

  // Keyboard shortcuts
  useHotkeys('/', (e) => {
    e.preventDefault()
    searchInputRef.current?.focus()
  }, { enableOnFormTags: false })

  useHotkeys('mod+n', (e) => {
    e.preventDefault()
    router.push('/prompt-library/new')
  })

  useHotkeys('mod+a', (e) => {
    e.preventDefault()
    if (prompts.length > 0) {
      usePromptLibraryStore.getState().selectAll(prompts.map(p => p.id))
    }
  })

  useHotkeys('escape', () => {
    if (selectedCount > 0) {
      clearSelection()
    }
  })

  useHotkeys('delete', () => {
    if (selectedCount > 0) {
      // Trigger delete action for selected prompts
      if (confirm(`Delete ${selectedCount} selected prompt(s)?`)) {
        // Handle bulk delete
      }
    }
  })

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Prompt Library</h1>
            <p className="text-sm text-muted-foreground">
              Manage and organize your saved prompts
            </p>
          </div>

          <Button onClick={() => router.push('/prompt-library/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Prompt
          </Button>
        </div>

        {/* Search and View Toggle */}
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) =>
                usePromptLibraryStore.getState().setSearchQuery(e.target.value)
              }
              placeholder="Search prompts... (Press / to focus)"
              className="pl-10"
            />
          </div>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
            <TabsList>
              <TabsTrigger value="grid">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Filters */}
      <SearchFilterBar />

      {/* Bulk Actions */}
      {selectedCount > 0 && (
        <BulkActionsBar
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
        />
      )}

      {/* Content Area */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-destructive">
                Error loading prompts. Please try again.
              </p>
            </div>
          ) : prompts.length === 0 ? (
            <EmptyState />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {prompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <PromptListItem key={prompt.id} prompt={prompt} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
