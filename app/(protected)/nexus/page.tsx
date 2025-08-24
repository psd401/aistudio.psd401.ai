'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useChat } from '@ai-sdk/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { NexusThread } from './_components/chat/nexus-thread'
import { ErrorBoundary } from './_components/error-boundary'
import { useModelsWithPersistence } from '@/lib/hooks/use-models'

export default function NexusPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  
  // Load models and manage model selection
  const { 
    models, 
    selectedModel, 
    setSelectedModel, 
    isLoading: isLoadingModels 
  } = useModelsWithPersistence('nexus-model', ['chat'])
  
  // Authentication verification for defense in depth
  useEffect(() => {
    if (status === 'loading') return // Still loading, wait
    
    if (status === 'unauthenticated' || !session?.user) {
      // Not authenticated, redirect to sign in
      router.push('/api/auth/signin?callbackUrl=/nexus')
      return
    }
  }, [session, status, router])

  // Create chat using standard approach that matches the existing assistant-ui pattern
  const chat = useChat({
    // Error handling
    onError: () => {
      // Use proper logging instead of console - implement later
    }
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
        <NexusShell
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          models={models}
          isLoadingModels={isLoadingModels}
        >
          <ErrorBoundary>
            <NexusThread className="h-full" />
          </ErrorBoundary>
        </NexusShell>
      </AssistantRuntimeProvider>
    </ErrorBoundary>
  )
}