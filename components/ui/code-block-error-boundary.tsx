'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy, RotateCw } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface CodeBlockErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface CodeBlockErrorBoundaryProps {
  children: React.ReactNode
  language?: string
  code?: string
  onError?: (error: Error, context: { language?: string; code?: string }) => void
  className?: string
}

export class CodeBlockErrorBoundary extends React.Component<
  CodeBlockErrorBoundaryProps,
  CodeBlockErrorBoundaryState
> {
  private retryCount = 0
  private maxRetries = 3

  constructor(props: CodeBlockErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<CodeBlockErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for monitoring (client-side safe)
    const errorContext = {
      message: error.message,
      stack: error.stack,
      language: this.props.language,
      codeLength: this.props.code?.length,
      componentStack: errorInfo.componentStack
    }
    
    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      console.error('CodeBlockErrorBoundary caught error:', errorContext)
    }
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, {
        language: this.props.language,
        code: this.props.code
      })
    }
  }

  handleRetry = () => {
    this.retryCount++
    
    if (this.retryCount > this.maxRetries) {
      toast({
        title: 'Maximum retries exceeded',
        description: 'Please refresh the page to try again',
        variant: 'destructive'
      })
      return
    }
    
    this.setState({
      hasError: false,
      error: null
    })
  }

  handleCopyRawCode = () => {
    if (this.props.code) {
      navigator.clipboard.writeText(this.props.code)
      toast({
        title: 'Code copied!',
        description: 'Raw code has been copied to clipboard'
      })
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Fallback UI for code block errors
      return (
        <CodeBlockErrorFallback
          error={this.state.error}
          language={this.props.language}
          code={this.props.code}
          onRetry={this.handleRetry}
          onCopy={this.handleCopyRawCode}
          retryCount={this.retryCount}
          maxRetries={this.maxRetries}
          className={this.props.className}
        />
      )
    }

    return this.props.children
  }
}

interface CodeBlockErrorFallbackProps {
  error: Error
  language?: string
  code?: string
  onRetry: () => void
  onCopy: () => void
  retryCount: number
  maxRetries: number
  className?: string
}

function CodeBlockErrorFallback({
  error,
  language,
  code,
  onRetry,
  onCopy,
  retryCount,
  maxRetries,
  className
}: CodeBlockErrorFallbackProps) {
  const canRetry = retryCount < maxRetries
  
  return (
    <div className={cn(
      'relative mb-4 mt-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4',
      className
    )}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-destructive">
              Code Rendering Error
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Failed to render {language ? `${language} ` : ''}code block
            </p>
          </div>
          
          {/* Show raw code in a simple pre block */}
          {code && (
            <div className="relative">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm font-mono">
                <code>{code}</code>
              </pre>
              <div className="absolute right-2 top-2 flex gap-2">
                {language && (
                  <span className="text-xs bg-background/50 px-2 py-1 rounded">
                    {language}
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={onCopy}
                  title="Copy code"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Error details in development */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Error details (development only)
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                {error.message}
                {error.stack && '\n\n' + error.stack}
              </pre>
            </details>
          )}
          
          {/* Retry button */}
          {canRetry && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="gap-2"
              >
                <RotateCw className="h-3 w-3" />
                Retry Rendering
              </Button>
              <span className="text-xs text-muted-foreground">
                ({retryCount}/{maxRetries} attempts)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook for programmatic error handling in code blocks
export function useCodeBlockErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null)
  const [context, setContext] = React.useState<{ language?: string; code?: string } | null>(null)
  
  const handleError = React.useCallback((error: Error, ctx: { language?: string; code?: string }) => {
    setError(error)
    setContext(ctx)
    
    // Log to monitoring in production
    if (process.env.NODE_ENV === 'production') {
      // This would send to your error monitoring service
      // For now, we'll just log client-safe info
      const errorInfo = {
        type: 'code_block_render_error',
        language: ctx.language,
        codeLength: ctx.code?.length,
        message: error.message
      }
      
      // TODO: Send errorInfo to monitoring service when API endpoint is available
      // For now, we just prepare the error info but don't send it
      // to avoid network failures
      // Example future implementation:
      // fetch('/api/log-error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorInfo)
      // }).catch(() => {
      //   // Silently fail if logging fails
      // })
      
      // Suppress unused variable warning - will be used when API is ready
      void errorInfo
    }
  }, [])
  
  const reset = React.useCallback(() => {
    setError(null)
    setContext(null)
  }, [])
  
  return { error, context, handleError, reset }
}