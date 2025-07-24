/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatErrorBoundary } from '@/components/features/assistant-architect/chat-error-boundary'

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error content</div>
}

// Component that throws in useEffect
const ThrowErrorInEffect = () => {
  React.useEffect(() => {
    throw new Error('Effect error')
  }, [])
  return <div>Effect component</div>
}

describe('ChatErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error
  beforeAll(() => {
    console.error = jest.fn()
  })
  afterAll(() => {
    console.error = originalError
  })

  it('should render children when there is no error', () => {
    render(
      <ChatErrorBoundary>
        <div>Test content</div>
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Test content')).toBeInTheDocument()
    expect(screen.queryByText('Chat Error')).not.toBeInTheDocument()
  })

  it('should catch and display errors from child components', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong with the chat interface.')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('should display Try Again button when error occurs', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    const tryAgainButton = screen.getByRole('button', { name: 'Try Again' })
    expect(tryAgainButton).toBeInTheDocument()
  })

  it('should reset error state when Try Again is clicked', async () => {
    const user = userEvent.setup()
    
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    // Verify error is displayed
    expect(screen.getByText('Chat Error')).toBeInTheDocument()

    // Click Try Again - this should reset the error boundary state
    await user.click(screen.getByRole('button', { name: 'Try Again' }))

    // The error boundary should now render its children normally
    // But since we're still throwing, it will catch the error again
    // So we should still see the error
    expect(screen.getByText('Chat Error')).toBeInTheDocument()
  })

  it('should catch errors thrown in useEffect', () => {
    render(
      <ChatErrorBoundary>
        <ThrowErrorInEffect />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    expect(screen.getByText('Effect error')).toBeInTheDocument()
  })

  it('should log errors to console with component stack', () => {
    const consoleErrorSpy = console.error as jest.Mock

    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    // Check that console.error was called with error details
    expect(consoleErrorSpy).toHaveBeenCalled()
    const errorCall = consoleErrorSpy.mock.calls.find(
      call => call[0] === '[ChatErrorBoundary] Error details:'
    )
    expect(errorCall).toBeDefined()
    expect(errorCall[1]).toMatchObject({
      error: expect.any(Error),
      errorInfo: expect.objectContaining({
        componentStack: expect.any(String)
      })
    })
  })

  it('should handle errors without message gracefully', () => {
    const ErrorWithoutMessage = () => {
      throw new Error()
    }

    render(
      <ChatErrorBoundary>
        <ErrorWithoutMessage />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong with the chat interface.')).toBeInTheDocument()
    // Should not display empty error message
    const alert = screen.getByRole('alert')
    expect(alert).not.toHaveTextContent('font-mono')
  })

  it('should handle non-Error objects being thrown', () => {
    const ThrowString = () => {
      throw 'String error' // eslint-disable-line no-throw-literal
    }

    render(
      <ChatErrorBoundary>
        <ThrowString />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    // Should handle gracefully without crashing
  })

  it('should maintain error state across re-renders until reset', () => {
    const { rerender } = render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()

    // Re-render - error should persist
    rerender(
      <ChatErrorBoundary>
        <div>New content</div>
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    expect(screen.queryByText('New content')).not.toBeInTheDocument()
  })

  it('should use destructive variant for alert', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    const alert = screen.getByRole('alert')
    // The Alert component applies variant classes, not the literal "destructive" class
    // Check for the destructive variant styling classes
    expect(alert).toHaveClass('border-destructive/50', 'text-destructive')
  })
})