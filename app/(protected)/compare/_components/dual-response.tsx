"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { IconPlayerStop, IconCopy, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { SelectAiModel } from "@/types"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ModelResponse {
  model: SelectAiModel | null
  response: string
  isLoading: boolean
  error?: string
}

interface DualResponseProps {
  model1: ModelResponse
  model2: ModelResponse
  onStopModel1: () => void
  onStopModel2: () => void
}

export function DualResponse({
  model1,
  model2,
  onStopModel1,
  onStopModel2
}: DualResponseProps) {
  const [copiedModel, setCopiedModel] = useState<'model1' | 'model2' | null>(null)

  const handleCopy = async (text: string, model: 'model1' | 'model2') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedModel(model)
      setTimeout(() => setCopiedModel(null), 2000)
    } catch {
      // Failed to copy - silently handle
    }
  }

  const renderResponse = (response: ModelResponse, modelKey: 'model1' | 'model2', onStop: () => void) => {
    const hasContent = response.response || response.error || response.isLoading

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
          <h3 className="font-semibold text-sm text-gray-900">
            {response.model?.name || 'Select a model'}
          </h3>
          <div className="flex items-center gap-2">
            {response.isLoading && (
              <Button
                onClick={onStop}
                size="sm"
                variant="ghost"
                className="h-7 px-2"
              >
                <IconPlayerStop className="h-3 w-3" />
              </Button>
            )}
            {response.response && (
              <Button
                onClick={() => handleCopy(response.response, modelKey)}
                size="sm"
                variant="ghost"
                className="h-7 px-2"
              >
                {copiedModel === modelKey ? (
                  <IconCheck className="h-3 w-3 text-green-500" />
                ) : (
                  <IconCopy className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {!hasContent && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Responses will appear here</p>
            </div>
          )}
          
          {response.error && (
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              {response.error}
            </div>
          )}
          
          {response.response && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  code: ({ className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '')
                    return match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        {...(props as Record<string, unknown>)}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {response.response}
              </ReactMarkdown>
            </div>
          )}
          
          {response.isLoading && !response.response && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>Generating response...</span>
            </div>
          )}
        </ScrollArea>
      </div>
    )
  }

  // Mobile view: tabs
  const [activeTab, setActiveTab] = useState<'model1' | 'model2'>('model1')

  return (
    <>
      {/* Desktop view: side-by-side */}
      <div className="hidden md:grid md:grid-cols-2 h-full divide-x">
        {renderResponse(model1, 'model1', onStopModel1)}
        {renderResponse(model2, 'model2', onStopModel2)}
      </div>
      
      {/* Mobile view: tabs */}
      <div className="flex flex-col h-full md:hidden">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('model1')}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === 'model1'
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {model1.model?.name || 'Model 1'}
          </button>
          <button
            onClick={() => setActiveTab('model2')}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === 'model2'
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {model2.model?.name || 'Model 2'}
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          {activeTab === 'model1' && renderResponse(model1, 'model1', onStopModel1)}
          {activeTab === 'model2' && renderResponse(model2, 'model2', onStopModel2)}
        </div>
      </div>
    </>
  )
}