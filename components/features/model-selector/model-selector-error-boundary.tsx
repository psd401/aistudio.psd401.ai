import { Component, ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ModelSelectorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log error details for debugging
    console.error('ModelSelector error:', {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <Alert variant="destructive" className="w-full">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load model selector. Please refresh the page or contact support if the issue persists.
          </AlertDescription>
        </Alert>
      )
    }

    return this.props.children
  }
}