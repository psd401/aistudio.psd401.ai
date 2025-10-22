"use client"

import { SearchIcon, SparklesIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

export function PublicGalleryHero() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "")
  const [isPending, startTransition] = useTransition()

  const handleSearch = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchQuery) {
        params.set("q", searchQuery)
      } else {
        params.delete("q")
      }
      params.delete("page") // Reset to page 1 on new search
      router.push(`/prompt-library/public?${params.toString()}`)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-center mb-4">
            <SparklesIcon className="h-12 w-12 text-primary mr-3" />
            <h1 className="text-4xl font-bold">Discover Community Prompts</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Explore prompts created by educators and administrators. Find the
            perfect starting point for your next AI conversation.
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search prompts by title, description, or content..."
              className="pl-12 pr-24 h-12 text-base"
              disabled={isPending}
            />
            <Button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={handleSearch}
              disabled={isPending}
            >
              {isPending ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
