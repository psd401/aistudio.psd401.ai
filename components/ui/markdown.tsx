"use client"

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-slate dark:prose-invert max-w-none break-words whitespace-pre-wrap", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 break-words">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mb-3 break-words">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-bold mb-2 break-words">{children}</h3>,
          p: ({ children }) => <p className="mb-2 leading-relaxed break-words whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-6 mb-2 break-words space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-2 break-words space-y-1">{children}</ol>,
          li: ({ children }) => <li className="break-words">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-300 dark:border-slate-700 pl-4 italic my-2 break-words">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5 text-sm break-all">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-100 dark:bg-slate-800 rounded p-4 overflow-x-auto mb-2 whitespace-pre-wrap break-words">
              {children}
            </pre>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
} 