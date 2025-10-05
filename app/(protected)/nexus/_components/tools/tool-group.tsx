'use client'

import { type PropsWithChildren, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Search, Loader2 } from 'lucide-react'
import { useMessage } from '@assistant-ui/react'

interface ToolGroupProps {
  startIndex: number
  endIndex: number
}

/**
 * ToolGroup component for consolidating multiple consecutive tool calls
 * Automatically used by assistant-ui when consecutive tool calls are detected
 */
export function ToolGroup({ startIndex, endIndex, children }: PropsWithChildren<ToolGroupProps>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const message = useMessage()

  // Check if ANY tool in this group is still running (no result yet)
  const isSearching = message.content
    .slice(startIndex, endIndex + 1)
    .some(part =>
      part.type === 'tool-call' &&
      ('result' in part && part.result === undefined)
    )

  const toolCount = endIndex - startIndex + 1

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Show spinner ONLY when searches are actually running */}
            {isSearching ? (
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            ) : (
              <Search className="h-4 w-4 text-blue-600" />
            )}
            <span className="text-sm font-medium text-blue-900">
              Web Searches ({toolCount})
            </span>
            {/* Show "Searching..." text ONLY when active */}
            {isSearching && (
              <span className="text-xs text-blue-600 animate-pulse">Searching...</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-2">
          {children}
        </CardContent>
      )}
    </Card>
  )
}
