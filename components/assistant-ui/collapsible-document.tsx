'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface CollapsibleDocumentProps {
  fileName: string
  content: string
}

/**
 * Collapsible component for displaying document content in chat messages
 * Shows file name and expand/collapse control prominently
 * Keeps document content hidden by default to avoid cluttering the UI
 */
export function CollapsibleDocument({ fileName, content }: CollapsibleDocumentProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card className="my-4 border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3 px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-between h-auto py-2 text-left hover:bg-blue-100 -mx-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span className="font-medium text-blue-900 truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <span className="text-xs text-blue-600 font-medium">
              {isExpanded ? 'Hide' : 'Show'} content
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-blue-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-blue-600" />
            )}
          </div>
        </Button>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 px-4 pb-4">
          <div className="max-h-96 overflow-y-auto rounded border border-blue-200 bg-white p-4 text-sm">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-xs">
              {content}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
