"use client"

import { MemoizedMarkdown } from "@/components/ui/memoized-markdown"
import { nanoid } from "nanoid"

interface ResponseDisplayProps {
  content: string
}

/**
 * Simple component to display AI model responses in the compare tool
 * Uses MemoizedMarkdown for consistent rendering
 */
export function ResponseDisplay({ content }: ResponseDisplayProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <MemoizedMarkdown content={content} id={nanoid()} />
    </div>
  )
}
