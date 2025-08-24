'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk'
import { Thread } from '@/components/assistant-ui/thread'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { ErrorBoundary } from './_components/error-boundary'
import { useModelsWithPersistence } from '@/lib/hooks/use-models'

export default function NexusPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  
  // Load models and manage model selection
  const { 
    models, 
    selectedModel, 
    setSelectedModel, 
    isLoading: isLoadingModels 
  } = useModelsWithPersistence('nexus-model', ['chat'])
  
  // Authentication verification for defense in depth
  useEffect(() => {
    if (sessionStatus === 'loading') return // Still loading, wait
    
    if (sessionStatus === 'unauthenticated' || !session?.user) {
      // Not authenticated, redirect to sign in
      router.push('/api/auth/signin?callbackUrl=/nexus')
      return
    }
  }, [session, sessionStatus, router])

  // Use assistant-ui with AI SDK runtime
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/nexus/chat',
      body: {
        modelId: selectedModel?.modelId,
        provider: selectedModel?.provider
      }
    })
  })
  
  // Show loading state while checking authentication
  if (sessionStatus === 'loading') {
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
  if (sessionStatus === 'unauthenticated' || !session?.user) {
    return null
  }

  return (
    <ErrorBoundary>
      <NexusShell
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        models={models}
        isLoadingModels={isLoadingModels}
      >
        <AssistantRuntimeProvider runtime={runtime}>
          <div className="flex h-full flex-col">
            <Thread />
          </div>
        </AssistantRuntimeProvider>
      </NexusShell>
    </ErrorBoundary>
  )
}