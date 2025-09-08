'use client'

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { Thread } from '@/components/assistant-ui/thread'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { NexusShell } from './_components/layout/nexus-shell'
import { ErrorBoundary } from './_components/error-boundary'
import { ConversationPanel } from './_components/conversation-panel'
import { useConversationContext, createNexusHistoryAdapter } from '@/lib/nexus/history-adapter'
import { WebSearchUI } from './_components/tools/web-search-ui'
import { CodeInterpreterUI } from './_components/tools/code-interpreter-ui'
import { useModelsWithPersistence } from '@/lib/hooks/use-models'
import { createEnhancedNexusAttachmentAdapter } from '@/lib/nexus/enhanced-attachment-adapters'
import { createNexusPollingAdapter } from '@/lib/nexus/nexus-polling-adapter'
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
  
  // Attachment processing state
  const [processingAttachments, setProcessingAttachments] = useState<Set<string>>(new Set())
  
  // Conversation continuity state
  const [conversationId, setConversationId] = useState<string | null>(null)
  
  
  // Conversation context for history adapter
  const conversationContext = useConversationContext()
  
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
    // Clear conversation ID when switching models for fresh conversation
    setConversationId(null);
    // Force page reload to ensure clean state
    if (model && selectedModel && model.modelId !== selectedModel.modelId) {
      window.location.reload();
    }
  }, [originalSetSelectedModel, selectedModel])

  // Memoized callback for tool changes to prevent unnecessary re-renders
  const onToolsChange = useCallback((tools: string[]) => {
    setEnabledTools(tools);
  }, [])

  // Attachment processing callbacks
  const handleAttachmentProcessingStart = useCallback((attachmentId: string) => {
    setProcessingAttachments(prev => new Set([...prev, attachmentId]))
    log.debug('Attachment processing started', { attachmentId })
  }, [])

  const handleAttachmentProcessingComplete = useCallback((attachmentId: string) => {
    setProcessingAttachments(prev => {
      const next = new Set(prev)
      next.delete(attachmentId)
      return next
    })
    log.debug('Attachment processing completed', { attachmentId })
  }, [])

  // Conversation ID callback for maintaining conversation continuity
  const handleConversationIdChange = useCallback((newConversationId: string) => {
    setConversationId(newConversationId)
    conversationContext.setConversationId(newConversationId)
    log.debug('Conversation ID updated', { 
      previousId: conversationId, 
      newId: newConversationId 
    })
  }, [conversationId, conversationContext])
  
  // Handle conversation selection from conversation list
  const handleConversationSelect = useCallback((selectedConversationId: string | null) => {
    setConversationId(selectedConversationId)
    conversationContext.setConversationId(selectedConversationId)
    log.debug('Conversation selected from list', { 
      conversationId: selectedConversationId 
    })
  }, [conversationContext])
  
  // Authentication verification for defense in depth
  useEffect(() => {
    if (sessionStatus === 'loading') return // Still loading, wait
    
    if (sessionStatus === 'unauthenticated' || !session?.user) {
      // Not authenticated, redirect to sign in
      router.push('/api/auth/signin?callbackUrl=/nexus')
      return
    }
  }, [session, sessionStatus, router])

  // Create the Nexus polling adapter that handles the universal polling architecture
  const pollingAdapter = useMemo(() => {
    if (!selectedModel) return null;
    
    return createNexusPollingAdapter({
      apiUrl: '/api/nexus/chat',
      bodyFn: () => ({
        modelId: selectedModel.modelId,
        provider: selectedModel.provider,
        enabledTools: enabledToolsRef.current
      }),
      pollTimeoutMs: 120000, // 2 minutes per poll - allows for longer document processing
      conversationId: conversationId || undefined,
      onConversationIdChange: handleConversationIdChange
    });
  }, [selectedModel, conversationId, handleConversationIdChange]);

  // Fallback adapter for when no model is selected
  const fallbackAdapter = useMemo(() => ({
    async run() {
      return {
        content: [{ 
          type: 'text' as const, 
          text: 'Please select a model to start chatting.' 
        }]
      }
    }
  }), [])

  // Create attachment adapter with processing callbacks
  const attachmentAdapter = useMemo(() => {
    return createEnhancedNexusAttachmentAdapter({
      onProcessingStart: handleAttachmentProcessingStart,
      onProcessingComplete: handleAttachmentProcessingComplete,
    })
  }, [handleAttachmentProcessingStart, handleAttachmentProcessingComplete])

  // Create a component that remounts when conversation changes
  const ConversationRuntime = useMemo(() => {
    // This component will be recreated when conversationId changes
    return function ConversationRuntimeComponent({ children }: { children: React.ReactNode }) {
      const historyAdapter = createNexusHistoryAdapter(conversationId)
      
      const runtime = useLocalRuntime(
        pollingAdapter || fallbackAdapter,
        {
          adapters: {
            attachments: attachmentAdapter,
            history: historyAdapter,
          },
        }
      )
      
      return (
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      )
    }
  }, [conversationId, pollingAdapter, fallbackAdapter, attachmentAdapter])

  
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
            <ConversationRuntime>
              {/* Register tool UI components */}
              <WebSearchUI />
              <CodeInterpreterUI />
              
              <div className="flex h-full flex-col">
                <Thread processingAttachments={processingAttachments} />
              </div>
              <ConversationPanel 
                onConversationSelect={handleConversationSelect}
                selectedConversationId={conversationId}
              />
            </ConversationRuntime>
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