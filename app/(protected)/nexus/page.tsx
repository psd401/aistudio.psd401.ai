'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk'
import { Thread } from '@/components/assistant-ui/thread'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { ErrorBoundary } from './_components/error-boundary'
import { ConversationPanel } from './_components/conversation-panel'
import { WebSearchUI } from './_components/tools/web-search-ui'
import { CodeInterpreterUI } from './_components/tools/code-interpreter-ui'
import { useModelsWithPersistence } from '@/lib/hooks/use-models'
import { createNexusAttachmentAdapter } from '@/lib/nexus/attachment-adapters'
import type { SelectAiModel } from '@/types'
import { createLogger } from '@/lib/client-logger'

const log = createLogger({ moduleName: 'nexus-page' })

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
  
  // Tool management state
  const [enabledTools, setEnabledTools] = useState<string[]>([])
  const enabledToolsRef = useRef(enabledTools)
  
  // Keep ref in sync with state
  useEffect(() => {
    enabledToolsRef.current = enabledTools
  }, [enabledTools])
  
  // Debug logging for enabled tools
  useEffect(() => {
    log.debug('Enabled tools changed', { enabledTools })
  }, [enabledTools])
  
  // Wrap setSelectedModel to reload page on model change
  const setSelectedModel = useCallback((model: SelectAiModel | null) => {
    originalSetSelectedModel(model);
    // Clear enabled tools when switching models
    setEnabledTools([]);
    // Force page reload to ensure clean state
    if (model && selectedModel && model.modelId !== selectedModel.modelId) {
      window.location.reload();
    }
  }, [originalSetSelectedModel, selectedModel])

  // Memoized callback for tool changes to prevent unnecessary re-renders
  const onToolsChange = useCallback((tools: string[]) => {
    setEnabledTools(tools);
  }, [])
  
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
        provider: selectedModel?.provider,
        enabledTools: enabledToolsRef.current
      })
    });
  }, [selectedModel?.modelId, selectedModel?.provider]);

  // Use the transport with the runtime and attachment adapters
  const runtime = useChatRuntime({ 
    transport,
    adapters: {
      attachments: createNexusAttachmentAdapter(),
    }
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
        enabledTools={enabledTools}
        onToolsChange={onToolsChange}
      >
        <div className="relative h-full">
          {selectedModel ? (
            <AssistantRuntimeProvider 
              key={`${selectedModel.modelId}-${selectedModel.provider}`} 
              runtime={runtime}
            >
              {/* Register tool UI components */}
              <WebSearchUI />
              <CodeInterpreterUI />
              
              <div className="flex h-full flex-col">
                <Thread />
              </div>
              <ConversationPanel />
            </AssistantRuntimeProvider>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="text-lg text-muted-foreground">Please select a model to start chatting</div>
              </div>
            </div>
          )}
        </div>
      </NexusShell>
    </ErrorBoundary>
  )
}