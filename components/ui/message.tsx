"use client"

import { Bot, User } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface MessageProps {
  message: {
    id: string
    role: "user" | "assistant"
    content: string
  }
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user"
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={`space-y-2 overflow-hidden ${isUser ? "order-1" : "max-w-[80%]"}`}>
        <div className={`prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg ${isUser ? "inline-block bg-gray-100 dark:bg-gray-800 text-right" : "bg-muted/50"}`}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
      {isUser && (
        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded bg-blue-100 dark:bg-blue-900/50 order-2">
          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}
    </div>
  )
} 