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
import { IconPlayerStop, IconSparkles, IconLoader2, IconBrain } from "@tabler/icons-react"
import { FileTextIcon, RefreshCwIcon } from "lucide-react"
import type { SelectAiModel } from "@/types"
import { useConversationContext } from "./conversation-context"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { nanoid } from 'nanoid'

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
  const [currentConversationId, setCurrentConversationId] = useState<number | undefined>(initialConversationId)
  const [models, setModels] = useState<SelectAiModel[]>([])
  const [selectedModel, setSelectedModelState] = useState<SelectAiModel | null>(null)
  
  // Wrapper to persist model selection to localStorage
  const setSelectedModel = useCallback((model: SelectAiModel | null) => {
    setSelectedModelState(model)
    if (model) {
      localStorage.setItem('selectedModelId', model.modelId)
      localStorage.setItem('selectedModelData', JSON.stringify(model))
    }
  }, [])
  const [documents, setDocuments] = useState<Document[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<Document | null>(null)
  const [, setProcessingDocumentId] = useState<string | null>(null)
  const [input, setInput] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { } = useConversationContext()
  const hiddenFileInputRef = useRef<HTMLInputElement>(null)
  const conversationIdRef = useRef<number | undefined>(currentConversationId)
  const selectedModelRef = useRef<SelectAiModel | null>(null)
  const pendingDocumentRef = useRef<Document | null>(null)
  
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
  
  // AI SDK v2: Standard useChat configuration following documentation
  const { 
    messages, 
    sendMessage,
    status,
    stop,
    error,
    regenerate,
    setMessages
  } = useChat({
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })
    },
    onResponse: (response: Response) => {
      // Handle conversation ID from response headers
      const header = response.headers.get('X-Conversation-Id')
      if (header) {
        const newId = parseInt(header, 10)
        if (!Number.isNaN(newId)) {
          setCurrentConversationId(newId)
          conversationIdRef.current = newId
        }
      }
    }
  } as UseChatOptions<UIMessage>)

  // Initialize component state
  useEffect(() => {
    const abortController = new AbortController()
    
    setCurrentConversationId(initialConversationId)
    
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

    // Use sendMessage to send the message with a unique ID and dynamic body
    // Pass the model identifier string (e.g., "gpt-5") not the database ID
    
    // AI SDK v2: sendMessage with message object and options
    const messageId = nanoid();
    
    // Clear input immediately for better UX
    setInput('')
    
    await sendMessage({
      id: messageId,
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: input }]
    }, {
      body: {
        modelId: selectedModel.modelId,  // Send the MODEL IDENTIFIER STRING
        conversationId: conversationIdRef.current,
        documentId: pendingDocument?.id,
        source: "chat"
      }
    })
  }, [input, selectedModel, sendMessage, toast, pendingDocument?.id])

  // Load models on mount
  useEffect(() => {
    const abortController = new AbortController()
    
    async function loadModels() {
      try {
        const response = await fetch("/api/chat/models", {
          signal: abortController.signal
        })
        
        if (!response.ok) {
          return
        }
        
        const result = await response.json()
        const modelsData = result.data || result
        
        if (!Array.isArray(modelsData) || modelsData.length === 0) {
          return
        }
        
        setModels(modelsData)
        
        // If no model is selected yet, try to restore from localStorage or select the first chat-capable model
        if (!selectedModel) {
          // First try to restore from localStorage
          const savedModelId = localStorage.getItem('selectedModelId')
          if (savedModelId) {
            const savedModel = modelsData.find(model => model.modelId === savedModelId)
            if (savedModel) {
              setSelectedModel(savedModel)
              return
            }
          }
          
          // If no saved model or it's not available, select the first chat-capable model
          const chatCapableModel = modelsData.find(model => {
            try {
              const capabilities = typeof model.capabilities === 'string' 
                ? JSON.parse(model.capabilities) 
                : model.capabilities
              return Array.isArray(capabilities) && capabilities.includes('chat')
            } catch {
              return false
            }
          })
          
          if (chatCapableModel) {
            setSelectedModel(chatCapableModel)
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        toast({
          title: "Error",
          description: "Failed to load models",
          variant: "destructive"
        })
      }
    }
    
    loadModels()
    
    return () => {
      abortController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])
  
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
          return
        }
      }
    }
    
    // For new conversations or when no conversation model found, try localStorage
    if (!initialConversationId || initialMessages.length === 0) {
      const savedModelId = localStorage.getItem('selectedModelId')
      if (savedModelId) {
        const savedModel = models.find(model => model.modelId === savedModelId)
        if (savedModel) {
          setSelectedModel(savedModel)
          return
        }
      }
    }
    
    // If no saved model or conversation model, select first chat-capable model
    const chatCapableModel = models.find(model => {
      try {
        const capabilities = typeof model.capabilities === 'string' 
          ? JSON.parse(model.capabilities) 
          : model.capabilities
        return Array.isArray(capabilities) && capabilities.includes('chat')
      } catch {
        return false
      }
    })
    
    if (chatCapableModel && !selectedModel) {
      setSelectedModel(chatCapableModel)
    }
  }, [models, initialConversationId, initialMessages, selectedModel, setSelectedModel])


  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      })
    }
  }, [messages])

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
              
              {/* Messages list - following AI SDK documentation pattern */}
              <div className="space-y-4">
                {messages.map((message) => (
                  <Message 
                    key={message.id}
                    message={message} 
                    messageId={message.id}
                  />
                ))}
                
                {/* Standard loading indicator based on status */}
                {status === 'streaming' && (
                  <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground">
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">
                      {selectedModel?.name || 'AI'} is responding...
                    </span>
                  </div>
                )}
                
                {/* Error display */}
                {error && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
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
                  </div>
                )}
              </div>
            </AnimatePresence>
          </ScrollArea>

          {/* Input Area - Fixed at bottom */}
          <div className="flex-shrink-0 p-4 bg-background/80 backdrop-blur-md border-t border-border/50">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <ChatInput
                input={input}
                handleInputChange={(e) => setInput(e.target.value)}
                handleSubmit={handleSubmit}
                isLoading={status === 'streaming'}
                disabled={!selectedModel || status === 'streaming'}
                onAttachClick={handleAttachClick}
                showAttachButton={true}
                ariaLabel="Type your message"
                inputId="chat-input-field"
                sendButtonAriaLabel="Send message"
                attachButtonAriaLabel="Attach document"
              />
              {status === 'streaming' && (
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
                    conversationId={currentConversationId} 
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