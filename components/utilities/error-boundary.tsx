"use client"

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    // You can also log the error to an error reporting service here
  }

  public render() {
    if (this.state.hasError) {
      return (
          <Alert variant="destructive" className="my-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Displaying Results</AlertTitle>
              <AlertDescription>
                 {this.props.fallbackMessage || "Something went wrong while trying to display the results."}
                 {/* Optionally display error details in development */} 
                 {process.env.NODE_ENV === 'development' && this.state.error && (
                    <pre className="mt-2 text-xs whitespace-pre-wrap">
                        {this.state.error.toString()}
                        \n
                        {this.state.error.stack}
                    </pre>
                 )}
              </AlertDescription>
          </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 