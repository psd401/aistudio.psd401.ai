'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk'
import { Thread } from '@/components/assistant-ui/thread'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useCallback } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { ErrorBoundary } from './_components/error-boundary'
import { useModelsWithPersistence } from '@/lib/hooks/use-models'
import type { SelectAiModel } from '@/types'

export default function NexusPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  
  // Load models and manage model selection
  const { 
    models, 
    selectedModel, 
    setSelectedModel: originalSetSelectedModel, 
    isLoading: isLoadingModels 
  } = useModelsWithPersistence('nexus-model', ['chat'])
  
  // Wrap setSelectedModel to reload page on model change
  const setSelectedModel = useCallback((model: SelectAiModel | null) => {
    originalSetSelectedModel(model);
    // Force page reload to ensure clean state
    if (model && selectedModel && model.modelId !== selectedModel.modelId) {
      window.location.reload();
    }
  }, [originalSetSelectedModel, selectedModel])
  
  // Authentication verification for defense in depth
  useEffect(() => {
    if (sessionStatus === 'loading') return // Still loading, wait
    
    if (sessionStatus === 'unauthenticated' || !session?.user) {
      // Not authenticated, redirect to sign in
      router.push('/api/auth/signin?callbackUrl=/nexus')
      return
    }
  }, [session, sessionStatus, router])

  // Create transport that updates when model changes
  const transport = useMemo(() => {
    return new AssistantChatTransport({
      api: '/api/nexus/chat',
      body: () => ({
        modelId: selectedModel?.modelId,
        provider: selectedModel?.provider
      })
    });
  }, [selectedModel?.modelId, selectedModel?.provider]);

  // Use the transport with the runtime
  const runtime = useChatRuntime({ transport })
  
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
        {selectedModel ? (
          <AssistantRuntimeProvider 
            key={`${selectedModel.modelId}-${selectedModel.provider}`} 
            runtime={runtime}
          >
            <div className="flex h-full flex-col">
              <Thread />
            </div>
          </AssistantRuntimeProvider>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-lg text-muted-foreground">Please select a model to start chatting</div>
            </div>
          </div>
        )}
      </NexusShell>
    </ErrorBoundary>
  )
}