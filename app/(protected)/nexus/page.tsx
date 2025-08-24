'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { NexusThread } from './_components/chat/nexus-thread'
import { ErrorBoundary } from './_components/error-boundary'

export default function NexusPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  
  // Authentication verification for defense in depth
  useEffect(() => {
    if (status === 'loading') return // Still loading, wait
    
    if (status === 'unauthenticated' || !session?.user) {
      // Not authenticated, redirect to sign in
      router.push('/api/auth/signin?callbackUrl=/nexus')
      return
    }
  }, [session, status, router])

  // Create chat with proper API endpoint configuration
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: '/api/nexus/chat'
    })
  })
  
  const runtime = useAISDKRuntime(chat)
  
  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <div className="text-lg text-muted-foreground">Loading Nexus...</div>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (status === 'unauthenticated' || !session?.user) {
    return null
  }
  
  return (
    <ErrorBoundary>
      <AssistantRuntimeProvider runtime={runtime}>
        <NexusShell>
          <ErrorBoundary>
            <NexusThread className="h-full" />
          </ErrorBoundary>
        </NexusShell>
      </AssistantRuntimeProvider>
    </ErrorBoundary>
  )
}