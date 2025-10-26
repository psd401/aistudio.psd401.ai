"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PlayIcon, EyeIcon, CopyIcon } from "lucide-react"
import { PromptPreviewModal } from "./prompt-preview-modal"
import type { PromptListItem } from "@/lib/prompt-library/types"
import { formatDistanceToNow } from "date-fns"
import { useRouter } from "next/navigation"
import { trackPromptUse } from "@/actions/prompt-library.actions"

interface PromptGalleryCardProps {
  prompt: PromptListItem
}

export function PromptGalleryCard({ prompt }: PromptGalleryCardProps) {
  const router = useRouter()
  const [showPreview, setShowPreview] = useState(false)

  const handleUsePrompt = async () => {
    // Track usage asynchronously (silently fail if tracking fails)
    trackPromptUse(prompt.id).catch(() => {
      // Tracking is non-critical, continue with navigation
    })

    // Navigate to Nexus chat with the prompt pre-loaded
    router.push(`/nexus?promptId=${prompt.id}`)
  }

  const handleViewDetails = () => {
    setShowPreview(true)
  }

  const getInitials = (name: string) => {
    return (
      name
        .trim()
        .split(/\s+/)
        .filter((n) => n.length > 0)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "??"
    )
  }

  return (
    <>
      <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col h-full">
        {/* Preview Pattern */}
        <div className="relative h-32 bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          />
          <div className="absolute bottom-2 right-2">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full backdrop-blur"
              onClick={handleViewDetails}
            >
              <EyeIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <CardHeader className="pb-3 flex-none">
          <h3 className="font-semibold text-lg line-clamp-2 min-h-[3.5rem]">
            {prompt.title}
          </h3>

          {/* Creator Badge */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {getInitials(prompt.ownerName || "Unknown")}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{prompt.ownerName || "Anonymous"}</span>
          </div>
        </CardHeader>

        <CardContent className="pb-3 flex-grow flex flex-col">
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3 flex-grow">
            {prompt.description || prompt.preview}
          </p>

          {/* Tags */}
          {prompt.tags && prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {prompt.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {prompt.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{prompt.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CopyIcon className="h-3 w-3" />
                {prompt.useCount} uses
              </span>
              <span className="flex items-center gap-1">
                <EyeIcon className="h-3 w-3" />
                {prompt.viewCount} views
              </span>
            </div>
            <span>
              {formatDistanceToNow(new Date(prompt.createdAt), {
                addSuffix: true
              })}
            </span>
          </div>
        </CardContent>

        <CardFooter className="pt-3 border-t flex-none">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleViewDetails}
            >
              <EyeIcon className="mr-1 h-3 w-3" />
              Preview
            </Button>
            <Button size="sm" className="flex-1" onClick={handleUsePrompt}>
              <PlayIcon className="mr-1 h-3 w-3" />
              Use
            </Button>
          </div>
        </CardFooter>
      </Card>

      <PromptPreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        promptId={prompt.id}
        onUse={handleUsePrompt}
      />
    </>
  )
}
