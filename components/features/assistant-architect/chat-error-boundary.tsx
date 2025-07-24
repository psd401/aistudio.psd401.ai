"use client"

import React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChatErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChatErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    console.error("[ChatErrorBoundary] Error caught:", error)
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ChatErrorBoundary] Error details:", {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Chat Error</AlertTitle>
          <AlertDescription className="mt-2">
            <p>Something went wrong with the chat interface.</p>
            {this.state.error?.message && (
              <p className="text-sm mt-1 font-mono">{this.state.error.message}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    return this.props.children
  }
}