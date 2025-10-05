'use client'

import { makeAssistantToolUI } from '@assistant-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Globe, Clock, Code2, Terminal } from 'lucide-react'

/**
 * Multi-Provider Tool UIs
 *
 * Registers tool UI components for all provider-specific tool names.
 * Provider-native tools execute on provider servers and results stream back
 * with provider-specific names (e.g., 'web_search_preview' for OpenAI,
 * 'google_search' for Google).
 */

// ============================================================================
// Web Search Tool UI (supports OpenAI and Google)
// ============================================================================

interface WebSearchArgs {
  query: string
  maxResults?: number
}

interface WebSearchResult {
  query: string
  results: Array<{
    title: string
    url: string
    snippet: string
    source: string
    publishedDate?: string
  }>
  searchTime: number
  totalResults: number
}

const WebSearchRenderer = ({ args, result }: { args: WebSearchArgs; result?: WebSearchResult }) => {
  if (!result) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-600 animate-pulse" />
            <CardTitle className="text-sm text-blue-900">Searching the web...</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Looking for: &ldquo;{args.query}&rdquo;
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-4 bg-blue-100 rounded animate-pulse" />
                <div className="h-3 bg-blue-100 rounded w-3/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm text-blue-900">Web Search Results</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {result.totalResults.toLocaleString()} results
          </Badge>
        </div>
        <CardDescription className="text-xs">
          <div className="flex items-center gap-4">
            <span>Query: &ldquo;{result.query}&rdquo;</span>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{result.searchTime}ms</span>
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.results.map((item, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium text-blue-900 leading-tight">
                {item.title}
              </h4>
              <ExternalLink className="h-3 w-3 text-blue-600 flex-shrink-0 mt-0.5" />
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <span className="font-medium">{item.source}</span>
              {item.publishedDate && (
                <>
                  <span>•</span>
                  <span>{new Date(item.publishedDate).toLocaleDateString()}</span>
                </>
              )}
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">
              {item.snippet}
            </p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline break-all"
            >
              {item.url}
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
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

const CodeInterpreterRenderer = ({ args, result }: { args: CodeInterpreterArgs; result?: CodeInterpreterResult }) => {
  if (!result) {
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

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm text-green-900">Code Execution</CardTitle>
          </div>
          {result.executionTime && (
            <Badge variant="secondary" className="text-xs">
              {result.executionTime}ms
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.stdout && (
          <div>
            <div className="text-xs font-semibold text-green-900 mb-1">Output:</div>
            <pre className="text-xs bg-green-100 p-2 rounded overflow-x-auto text-green-900">
              {result.stdout}
            </pre>
          </div>
        )}

        {result.output && (
          <div>
            <div className="text-xs font-semibold text-green-900 mb-1">Result:</div>
            <pre className="text-xs bg-green-100 p-2 rounded overflow-x-auto text-green-900">
              {result.output}
            </pre>
          </div>
        )}

        {result.error && (
          <div>
            <div className="text-xs font-semibold text-red-900 mb-1">Error:</div>
            <pre className="text-xs bg-red-100 p-2 rounded overflow-x-auto text-red-900">
              {result.error}
            </pre>
          </div>
        )}

        {result.stderr && (
          <div>
            <div className="text-xs font-semibold text-yellow-900 mb-1">stderr:</div>
            <pre className="text-xs bg-yellow-100 p-2 rounded overflow-x-auto text-yellow-900">
              {result.stderr}
            </pre>
          </div>
        )}

        {result.files && result.files.length > 0 && (
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
      {/* Web Search - all provider variants */}
      <OpenAIWebSearchUI />
      <GoogleSearchUI />

      {/* Code Interpreter */}
      <CodeInterpreterUI />
    </>
  )
}
