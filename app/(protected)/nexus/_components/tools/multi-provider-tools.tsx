'use client'

import { makeAssistantToolUI, type ToolCallMessagePartStatus } from '@assistant-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Globe, Clock, Code2, Terminal, ExternalLink } from 'lucide-react'

/**
 * Multi-Provider Tool UIs
 *
 * Registers tool UI components for provider-specific tools.
 * Search tools will be displayed in a ToolGroup when multiple searches occur.
 */

// ============================================================================
// Web Search Tool UI (OpenAI & Google)
// ============================================================================

interface WebSearchArgs {
  query: string
  maxResults?: number
}

interface WebSearchResult {
  query?: string
  results?: Array<{
    title: string
    url: string
    snippet: string
    source: string
    publishedDate?: string
  }>
  searchTime?: number
  totalResults?: number
}

const WebSearchRenderer = ({ args, result, status, argsText }: { args: WebSearchArgs; result?: WebSearchResult; status: ToolCallMessagePartStatus; argsText: string }) => {
  // Extract query from multiple possible sources with robust parsing
  let query = 'Unknown query';

  // Try to get query from args first (most reliable)
  if (args && typeof args === 'object' && args.query) {
    query = args.query;
  }
  // Try parsing argsText as JSON fallback
  else if (argsText) {
    try {
      const parsedArgs = JSON.parse(argsText);
      if (parsedArgs && typeof parsedArgs === 'object' && parsedArgs.query) {
        query = parsedArgs.query;
      }
    } catch {
      // If parsing fails, argsText might be the query itself
      if (argsText.trim() && !argsText.startsWith('{')) {
        query = argsText;
      }
    }
  }
  // Try result as last resort
  else if (result?.query) {
    query = result.query;
  }

  // Loading state - show what we're searching for
  if (status.type === "running" || status.type === "requires-action") {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Globe className="h-4 w-4 text-blue-600 animate-pulse flex-shrink-0" />
            <span className="text-sm text-blue-900 truncate">
              <span className="font-medium">Searching:</span> {query}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            <span>In progress</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (status.type === "incomplete" && status.reason === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-red-600" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-900">Search failed</div>
            <div className="text-xs text-red-700 break-words">{query}</div>
          </div>
        </div>
      </div>
    )
  }

  // Success state - show query and results info
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Globe className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-blue-900 mb-1 break-words">
              {query}
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-700">
              {result?.totalResults !== undefined && (
                <span>{result.totalResults.toLocaleString()} results</span>
              )}
              {result?.searchTime !== undefined && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{result.searchTime}ms</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          ✓ Complete
        </Badge>
      </div>
    </div>
  )
}

// OpenAI web search tool
export const OpenAIWebSearchUI = makeAssistantToolUI<WebSearchArgs, WebSearchResult>({
  toolName: 'web_search_preview',
  render: WebSearchRenderer
})

// Google search tool
export const GoogleSearchUI = makeAssistantToolUI<WebSearchArgs, WebSearchResult>({
  toolName: 'google_search',
  render: WebSearchRenderer
})

// ============================================================================
// Code Interpreter Tool UI (OpenAI)
// ============================================================================

interface CodeInterpreterArgs {
  code?: string
  language?: string
  files?: string[]
}

interface CodeInterpreterResult {
  output?: string
  error?: string
  stdout?: string
  stderr?: string
  executionTime?: number
  files?: Array<{
    name: string
    url: string
    type: string
  }>
}

const CodeInterpreterRenderer = ({ args, result, status }: { args: CodeInterpreterArgs; result?: CodeInterpreterResult; status: ToolCallMessagePartStatus }) => {
  // Loading state - official assistant-ui pattern
  if (status.type === "running") {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-green-600 animate-pulse" />
            <CardTitle className="text-sm text-green-900">Executing code...</CardTitle>
          </div>
          {args.code && (
            <CardDescription className="text-xs font-mono text-green-800">
              {args.code.substring(0, 100)}
              {args.code.length > 100 && '...'}
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    )
  }

  // Error state - official assistant-ui pattern
  if (status.type === "incomplete" && status.reason === "error") {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-red-600" />
            <CardTitle className="text-sm text-red-900">Code Execution Failed</CardTitle>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm text-green-900">Code Execution</CardTitle>
          </div>
          {result?.executionTime !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {result.executionTime}ms
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result?.stdout && (
          <div>
            <div className="text-xs font-semibold text-green-900 mb-1">Output:</div>
            <pre className="text-xs bg-green-100 p-2 rounded overflow-x-auto text-green-900">
              {result.stdout}
            </pre>
          </div>
        )}

        {result?.output && (
          <div>
            <div className="text-xs font-semibold text-green-900 mb-1">Result:</div>
            <pre className="text-xs bg-green-100 p-2 rounded overflow-x-auto text-green-900">
              {result.output}
            </pre>
          </div>
        )}

        {result?.error && (
          <div>
            <div className="text-xs font-semibold text-red-900 mb-1">Error:</div>
            <pre className="text-xs bg-red-100 p-2 rounded overflow-x-auto text-red-900">
              {result.error}
            </pre>
          </div>
        )}

        {result?.stderr && (
          <div>
            <div className="text-xs font-semibold text-yellow-900 mb-1">stderr:</div>
            <pre className="text-xs bg-yellow-100 p-2 rounded overflow-x-auto text-yellow-900">
              {result.stderr}
            </pre>
          </div>
        )}

        {result?.files && result.files.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-900 mb-1">Generated Files:</div>
            <div className="space-y-1">
              {result.files.map((file, index) => (
                <a
                  key={index}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-green-700 hover:text-green-900 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {file.name} ({file.type})
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const CodeInterpreterUI = makeAssistantToolUI<CodeInterpreterArgs, CodeInterpreterResult>({
  toolName: 'code_interpreter',
  render: CodeInterpreterRenderer
})

// ============================================================================
// Wrapper Component - Registers All Tool UIs
// ============================================================================

export function MultiProviderToolUIs() {
  return (
    <>
      {/* Web Search tools - will be grouped by ToolGroup when multiple searches occur */}
      <OpenAIWebSearchUI />
      <GoogleSearchUI />

      {/* Code Interpreter - shows execution results */}
      <CodeInterpreterUI />
    </>
  )
}
