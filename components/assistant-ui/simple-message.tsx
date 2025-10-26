"use client"

import { MemoizedMarkdown } from "@/components/ui/memoized-markdown"
import { cn } from "@/lib/utils"
import { nanoid } from "nanoid"

interface SimpleMessageProps {
  role: "user" | "assistant"
  content: string
  className?: string
}

/**
 * Simple message display for components not yet using assistant-ui runtime
 * For new features, prefer using assistant-ui's MessagePrimitive instead
 */
export function SimpleMessage({ role, content, className }: SimpleMessageProps) {
  return (
    <div className={cn("flex w-full", className)}>
      <div className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        role === "user" && "text-foreground"
      )}>
        <MemoizedMarkdown content={content} id={nanoid()} />
      </div>
    </div>
  )
}
