"use client"

import { useChat, type UseChatOptions, type UIMessage } from '@ai-sdk/react'
import { useEffect, useRef, useState, useCallback } from "react"
import { Message } from "./message"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "@/components/features/model-selector"
import { DocumentUpload } from "./document-upload"
import { DocumentList } from "./document-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { IconPlayerStop, IconSparkles } from "@tabler/icons-react"
import { FileTextIcon, RefreshCwIcon } from "lucide-react"
import type { SelectAiModel } from "@/types"
import { useConversationContext } from "./conversation-context"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { nanoid } from 'nanoid'
import { useModelsWithPersistence } from "@/lib/hooks/use-models"

interface Document {
  id: string
  name: string
  type: string
  url: string
  size?: number
  createdAt?: string
  conversationId?: number
}

interface ChatProps {
  conversationId?: number
  initialMessages?: Array<{
    id: string
    content: string
    role: "user" | "assistant"
    modelId?: number | null
    modelName?: string | null
    modelProvider?: string | null
    modelIdentifier?: string | null
    reasoningContent?: string | null
    tokenUsage?: Record<string, unknown>
  }>
}

export function Chat({ conversationId: initialConversationId, initialMessages = [] }: ChatProps) {
  // State management - simplified without URL dependency
  const [currentConversationId, setCurrentConversationId] = useState<number | undefined>(initialConversationId)
  const [isNewChat, setIsNewChat] = useState<boolean>(!initialConversationId)
  
  // Use shared model management hook
  const { models, selectedModel, setSelectedModel } = useModelsWithPersistence('selectedModel', ['chat'])
  
  const [documents, setDocuments] = useState<Document[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<Document | null>(null)
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null)
  const [, setProcessingDocumentId] = useState<string | null>(null)
  const [input, setInput] = useState<string>('')
  const [useUnifiedStreaming, setUseUnifiedStreaming] = useState<boolean>(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { triggerRefresh } = useConversationContext()
  const hiddenFileInputRef = useRef<HTMLInputElement>(null)
  const conversationIdRef = useRef<number | undefined>(currentConversationId)
  const selectedModelRef = useRef<SelectAiModel | null>(null)
  const pendingDocumentRef = useRef<Document | null>(null)
  const hasUpdatedUrlRef = useRef<boolean>(false)
  
  // Update refs when values change
  useEffect(() => {
    conversationIdRef.current = currentConversationId
  }, [currentConversationId])
  
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])
  
  useEffect(() => {
    pendingDocumentRef.current = pendingDocument
  }, [pendingDocument])
  
  // AI SDK v2: Optimistic UI pattern with metadata for conversation ID
  const { 
    messages, 
    sendMessage,
    status,
    stop,
    error,
    regenerate,
    setMessages
  } = useChat({
    // Pass conversation ID via metadata (industry standard approach)
    body: {
      modelId: selectedModel?.id,
      conversationId: currentConversationId,
      documentId: uploadedDocumentId,
      useUnifiedStreaming
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })
    },
    onResponse: (response: Response) => {
      // Handle conversation creation for new chats
      const header = response.headers.get('X-Conversation-Id')
      
      if (header && isNewChat) {
        const newId = parseInt(header, 10)
        
        if (!Number.isNaN(newId) && newId > 0) {
          // New conversation created - update state
          setCurrentConversationId(newId)
          conversationIdRef.current = newId
          setIsNewChat(false)
          
          // Silently update URL without navigation (industry standard)
          if (!hasUpdatedUrlRef.current) {
            hasUpdatedUrlRef.current = true
            const newUrl = `/chat?conversation=${newId}`
            window.history.replaceState({}, '', newUrl)
          }
          
          // Trigger sidebar refresh
          setTimeout(() => {
            triggerRefresh()
          }, 500)
        }
      }
    },
    onFinish: () => {
      // Only refresh sidebar for new conversations
      if (isNewChat && currentConversationId) {
        setTimeout(() => {
          triggerRefresh()
        }, 1000)
      }
    }
  } as UseChatOptions<UIMessage>)
  
  // Initialize component state - simplified without polling
  useEffect(() => {
    const abortController = new AbortController()
    
    // Reset URL flag when conversation changes
    hasUpdatedUrlRef.current = false
    
    setCurrentConversationId(initialConversationId)
    setIsNewChat(!initialConversationId)
    
    if (initialConversationId && initialMessages.length > 0) {
      // Only set messages if we have actual messages to display
      const processedMessages = initialMessages.map((msg, index) => ({
        id: msg.id && msg.id.trim() !== '' ? msg.id : `initial-${index}-${nanoid()}`,
        role: msg.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: msg.content }],
        // Preserve model information for the model selector
        ...(msg.modelId && { modelId: msg.modelId }),
        ...(msg.modelName && { modelName: msg.modelName }),
        ...(msg.modelProvider && { modelProvider: msg.modelProvider }),
        ...(msg.modelIdentifier && { modelIdentifier: msg.modelIdentifier }),
        ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
        ...(msg.tokenUsage && { tokenUsage: msg.tokenUsage })
      }))
      setMessages(processedMessages)
      fetchDocuments(initialConversationId, abortController.signal)
    } else {
      // Clear everything for new chat
      setMessages([])
      setInput('')
      setDocuments([])
      setShowDocuments(false)
      setPendingDocument(null)
      setProcessingDocumentId(null)
    }
    
    return () => {
      abortController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId, initialMessages])

  const fetchDocuments = async (convId?: number, signal?: AbortSignal) => {
    const idToUse = convId || currentConversationId
    if (!idToUse) return

    try {
      const response = await fetch(`/api/documents?conversationId=${idToUse}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        cache: 'no-store',
        signal: signal
      })
      
      if (!response.ok) throw new Error("Failed to fetch documents")
      
      const data = await response.json()
      
      if (data.success && data.documents) {
        setDocuments(data.documents.length > 0 ? data.documents : [])
        setShowDocuments(data.documents.length > 0)
      } else {
        setDocuments([])
      }
    } catch {
      setDocuments([])
    }
  }

  const forceDocumentRefresh = () => {
    if (currentConversationId) {
      const abortController = new AbortController()
      fetchDocuments(currentConversationId, abortController.signal)
    }
  }

  const handleDocumentUpload = async (documentInfo: Document) => {
    setDocuments(prev => {
      const exists = prev.some(doc => doc.id === documentInfo.id)
      if (exists) return prev
      return [...prev, documentInfo]
    })
    
    setProcessingDocumentId(documentInfo.id)
    // Keep the uploaded document ID for the first message
    setUploadedDocumentId(documentInfo.id)
    setPendingDocument(null)
    setShowDocuments(true)
    
    if (currentConversationId) {
      try {
        const response = await fetch('/api/documents/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: documentInfo.id,
            conversationId: currentConversationId
          })
        })
        
        if (!response.ok) {
          throw new Error('Failed to link document to conversation')
        }
        
        fetchDocuments(currentConversationId)
      } catch {
        toast({
          title: "Warning",
          description: "Document uploaded but not linked to conversation.",
          variant: "destructive"
        })
      }
    }
    
    toast({
      title: "Document uploaded",
      description: `${documentInfo.name} has been uploaded successfully`,
      variant: "default"
    })
  }
  
  const handleDocumentSelected = (documentInfo: Partial<Document>) => {
    setPendingDocument(documentInfo as Document)
  }


  const handleDocumentDelete = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents?id=${documentId}`, {
        method: "DELETE"
      })
      
      if (!response.ok) throw new Error("Failed to delete document")
      
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      
      return true
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      })
      throw error
    }
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive"
      })
      return
    }
    
    if (!selectedModel) {
      toast({
        title: "Error",
        description: "Please select a model",
        variant: "destructive"
      })
      return
    }

    // Optimistic UI: Clear input immediately before sending
    const messageText = input
    setInput('')
    
    // Generate message ID for tracking
    const messageId = nanoid();
    
    // Clear document ID after first message (it's now linked)
    if (uploadedDocumentId && !isNewChat) {
      setUploadedDocumentId(null)
    }
    
    // Send message with metadata (industry standard approach)
    await sendMessage({
      id: messageId,
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: messageText }]
    }, {
      body: {
        modelId: selectedModel.modelId,  // Model identifier string
        conversationId: currentConversationId,  // Will be undefined for new chats
        documentId: uploadedDocumentId || pendingDocument?.id,
        source: "chat",
        useUnifiedStreaming
      }
    })
  }, [input, selectedModel, sendMessage, toast, pendingDocument?.id, uploadedDocumentId, useUnifiedStreaming, currentConversationId, isNewChat])
  
  // Update selected model when conversation changes
  useEffect(() => {
    if (models.length === 0) return
    
    // For existing conversations with messages, try to use the conversation's model
    if (initialConversationId && initialMessages.length > 0) {
      const lastAssistantMessage = [...initialMessages].reverse().find(msg => msg.role === 'assistant')
      
      if (lastAssistantMessage) {
        let conversationModel = null
        
        // First try to match by database ID
        if (lastAssistantMessage.modelId) {
          conversationModel = models.find(model => 
            Number(model.id) === Number(lastAssistantMessage.modelId)
          )
        }
        
        // If not found by ID, try to match by model name or identifier
        if (!conversationModel && lastAssistantMessage.modelName) {
          conversationModel = models.find(model => 
            model.name === lastAssistantMessage.modelName ||
            model.modelId === lastAssistantMessage.modelIdentifier
          )
        }
        
        // If still not found, try matching by model identifier alone (for GPT-5 issue)
        if (!conversationModel && lastAssistantMessage.modelIdentifier) {
          conversationModel = models.find(model => 
            model.modelId === lastAssistantMessage.modelIdentifier
          )
        }
        
        if (conversationModel) {
          setSelectedModel(conversationModel)
        }
      }
    }
  }, [models, initialConversationId, initialMessages, setSelectedModel])


  // Auto-scroll to bottom when messages change or status updates
  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
          const isNearBottom = scrollHeight - scrollTop <= clientHeight + 100
          
          // Only auto-scroll if user is already near the bottom or if it's a new conversation
          if (isNearBottom || messages.length <= 1) {
            scrollRef.current.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: messages.length === 0 ? "instant" : "smooth"
            })
          }
        }
      })
    }
  }, [messages, status]) // Include status to scroll when thinking/responding starts

  const handleAttachClick = () => {
    if (!currentConversationId && messages.length === 0) {
      toast({
        title: "Info",
        description: "The document will be uploaded when you start a conversation",
        variant: "default"
      })
    }
    setShowDocuments(true)
    if (!pendingDocument) {
      hiddenFileInputRef.current?.click()
    }
  }


  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border/50">
        <ModelSelector
          models={models}
          value={selectedModel}
          onChange={setSelectedModel}
          requiredCapabilities={["chat"]}
          placeholder="Select a chat model"
          showDescription={true}
          groupByProvider={true}
          hideRoleRestricted={true}
          hideCapabilityMissing={true}
        />
        
        <div className="flex items-center gap-2">
          {/* Test toggle for unified streaming */}
          <Button
            variant={useUnifiedStreaming ? "default" : "outline"}
            size="sm"
            onClick={() => setUseUnifiedStreaming(!useUnifiedStreaming)}
            className="flex items-center gap-1 transition-all"
            title={`Unified Streaming: ${useUnifiedStreaming ? 'ON' : 'OFF'}`}
          >
            <IconSparkles className="h-3.5 w-3.5" />
            <span className="text-xs">Unified</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={forceDocumentRefresh}
            className="flex items-center gap-1 hover:bg-accent/50 transition-all"
            title="Force refresh documents"
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Refresh Documents</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDocuments(!showDocuments)}
            className="flex items-center gap-2 hover:bg-accent/50 transition-all"
          >
            <FileTextIcon className="h-4 w-4" />
            {showDocuments ? "Hide" : "Documents"}
            {documents.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-primary text-primary-foreground animate-pulse">
                {documents.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Main content area - Scrollable independently */}
      <div className="flex flex-1 min-h-0">
        {/* Messages Area - Independent scroll */}
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea ref={scrollRef} className="flex-1 p-6">
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div 
                  key="empty-state"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center h-full text-center space-y-4 min-h-[400px]"
                >
                  <div className="relative">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-primary/20 to-accent/20 blur-3xl" />
                    <IconSparkles className="h-16 w-16 text-primary relative" />
                  </div>
                  <h2 className="text-2xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Start a new conversation
                  </h2>
                  <p className="text-muted-foreground max-w-sm">
                    Choose a model and send your first message to begin
                  </p>
                </motion.div>
              )}
              
              {/* Messages list - AI SDK v2 pattern: render all messages including empty ones */}
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isLastMessage = index === messages.length - 1
                  const isCurrentlyStreaming = isLastMessage && status === 'streaming'
                  const isAssistantStreaming = isCurrentlyStreaming && message.role === 'assistant'
                  
                  return (
                    <Message 
                      key={message.id}
                      message={message} 
                      messageId={message.id}
                      isStreaming={isCurrentlyStreaming}
                      showLoadingState={isAssistantStreaming}
                    />
                  )
                })}
                
                {/* Error display */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive"
                  >
                    <p className="text-sm font-medium">Error occurred</p>
                    <p className="text-xs mt-1">{error.message}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => regenerate()}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </motion.div>
                )}
              </div>
            </AnimatePresence>
          </ScrollArea>

          {/* Input Area - Fixed at bottom */}
          <div className="flex-shrink-0 p-4 bg-background/80 backdrop-blur-md border-t border-border/50">
            <div className="min-h-[56px] flex items-end">
              <form onSubmit={handleSubmit} className="flex items-end gap-2 w-full">
              <ChatInput
                input={input}
                handleInputChange={(e) => setInput(e.target.value)}
                handleSubmit={handleSubmit}
                isLoading={status === 'submitted' || status === 'streaming'}
                disabled={!selectedModel || status === 'submitted' || status === 'streaming'}
                onAttachClick={handleAttachClick}
                showAttachButton={true}
                ariaLabel="Type your message"
                inputId="chat-input-field"
                sendButtonAriaLabel="Send message"
                attachButtonAriaLabel="Attach document"
              />
              {(status === 'submitted' || status === 'streaming') && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={stop}
                  className={cn(
                    "hover:bg-destructive/10 hover:text-destructive transition-all",
                    "border-destructive/20"
                  )}
                  aria-label="Stop generation"
                >
                  <IconPlayerStop className="h-4 w-4" />
                </Button>
              )}
              </form>
            </div>
          </div>
        </div>

        {/* Documents Panel - Independent scroll */}
        <AnimatePresence>
          {showDocuments && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "16rem", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="border-l border-border/50 bg-background/50 backdrop-blur-sm flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-4">
                  <DocumentUpload 
                    onUploadComplete={handleDocumentUpload}
                    onFileSelected={handleDocumentSelected}
                    externalInputRef={hiddenFileInputRef}
                    pendingDocument={pendingDocument}
                  />
                  
                  <DocumentList 
                    conversationId={currentConversationId}
                    documents={documents}
                    onDeleteDocument={handleDocumentDelete}
                    onRefresh={() => {
                      const abortController = new AbortController()
                      fetchDocuments(currentConversationId, abortController.signal)
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}