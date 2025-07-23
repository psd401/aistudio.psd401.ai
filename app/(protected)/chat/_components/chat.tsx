"use client"

import { useChat } from 'ai/react'
import { useEffect, useRef, useState } from "react"
import { Message } from "./message"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { DocumentUpload } from "./document-upload"
import { DocumentList } from "./document-list"
import { AiThinkingIndicator } from "./ai-thinking-indicator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { IconPlayerStop } from "@tabler/icons-react"
import { FileTextIcon } from "lucide-react"
import type { SelectAiModel } from "@/types"
import { RefreshCwIcon } from "lucide-react"

interface Document {
  id: string
  name: string
  type: string
  url: string
  size?: number
  createdAt?: string
}

interface ChatProps {
  conversationId?: number
  initialMessages?: Array<{
    id: string
    content: string
    role: "user" | "assistant"
  }>
}

export function Chat({ conversationId: initialConversationId, initialMessages = [] }: ChatProps) {
  const [currentConversationId, setCurrentConversationId] = useState<number | undefined>(initialConversationId)
  const [models, setModels] = useState<SelectAiModel[]>([])
  const [selectedModel, setSelectedModel] = useState<SelectAiModel | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<Document | null>(null)
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const hiddenFileInputRef = useRef<HTMLInputElement>(null)
  
  // Use Vercel AI SDK's useChat hook
  const { messages, input, handleInputChange, handleSubmit: handleChatSubmit, isLoading, stop, setMessages, setInput } = useChat({
    api: '/api/chat/stream-final',
    initialMessages,
    body: {
      modelId: selectedModel?.model_id,
      conversationId: currentConversationId,
      documentId: currentConversationId === undefined && processingDocumentId ? processingDocumentId : undefined
    },
    onResponse: (response) => {
      // Get conversation ID from header
      const headerConversationId = response.headers.get('X-Conversation-Id')
      if (headerConversationId && !currentConversationId) {
        const newId = parseInt(headerConversationId)
        setCurrentConversationId(newId)
        window.history.pushState({}, '', `/chat?conversation=${newId}`)
        if (processingDocumentId) {
          linkUnlinkedDocuments(newId).then(() => {
            setProcessingDocumentId(null)
          })
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })
    }
  })

  // Initialize component state
  useEffect(() => {
    const abortController = new AbortController()
    
    setCurrentConversationId(initialConversationId)
    
    if (initialConversationId) {
      // Load existing conversation
      setMessages(initialMessages)
      fetchDocuments(initialConversationId, abortController.signal)
    } else {
      // New chat - ensure everything is cleared
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
  }, []) // Intentionally empty - initialization effect that should only run once on mount

  useEffect(() => {
    if (pendingDocument && currentConversationId) {
      toast({
        title: "Uploading document",
        description: `Uploading ${pendingDocument.name} to conversation`,
        variant: "default"
      })
    }
  }, [currentConversationId, pendingDocument, toast])

  useEffect(() => {
    if (documents.length > 0) {
      setShowDocuments(true)
    }
  }, [documents])

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
        if (data.documents.length > 0) {
          setDocuments(data.documents)
          setShowDocuments(true)
        } else {
          setDocuments([])
        }
      } else {
        setDocuments([])
      }
    } catch {
      // console.error('[fetchDocuments] Error:', _error)
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
        // console.error("[handleDocumentUpload] Error linking document:", _error)
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

  const linkUnlinkedDocuments = async (conversationId: number) => {
    const documentsToLink = documents.filter(doc => !doc.conversationId || doc.conversationId !== conversationId)
    
    if (processingDocumentId && !documentsToLink.find(doc => doc.id === processingDocumentId)) {
      documentsToLink.push({ id: processingDocumentId, name: "Processing document" } as Document)
    }
    
    if (documentsToLink.length === 0) return
    
    for (const doc of documentsToLink) {
      try {
        const response = await fetch('/api/documents/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id,
            conversationId: conversationId
          })
        })
        
        if (!response.ok) {
          // console.error(`Failed to link document ${doc.id}`)
          continue
        }
      } catch {
        // console.error(`Error linking document ${doc.id}:`, _error)
      }
    }
    
    const abortController = new AbortController()
    fetchDocuments(conversationId, abortController.signal)
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
      // console.error('[handleDocumentDelete] Error:', error)
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      })
      throw error
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
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

    handleChatSubmit(e)
  }

  useEffect(() => {
    const abortController = new AbortController()
    
    async function loadModels() {
      try {
        const response = await fetch("/api/chat/models", {
          signal: abortController.signal
        })
        
        if (!response.ok) {
          // console.error(`[loadModels] Error: ${response.status} ${response.statusText}`)
          return
        }
        
        const result = await response.json()
        const modelsData = result.data || result
        
        if (!Array.isArray(modelsData) || modelsData.length === 0) {
          return
        }
        
        const chatModels = modelsData.filter(model => model.chat_enabled === true)
        
        if (chatModels.length > 0) {
          setModels(chatModels)
          setSelectedModel(chatModels[0])
        }
      } catch (error) {
        // Don't show toast if the request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        // console.error('[loadModels] Error:', error)
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
  }, [toast])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      })
    }
  }, [messages, isLoading])

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
    <div className="flex flex-col h-full bg-white border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelSelect={setSelectedModel}
        />
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={forceDocumentRefresh}
            className="flex items-center gap-1"
            title="Force refresh documents"
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Refresh Documents</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDocuments(!showDocuments)}
            className="flex items-center gap-2"
          >
            <FileTextIcon className="h-4 w-4" />
            {showDocuments ? "Hide Documents" : "Documents"}
            {documents.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                {documents.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea ref={scrollRef} className="flex-1 p-4 bg-white">
          <div role="list" aria-label="Chat messages">
            {messages.map((message) => (
              <Message 
                key={message.id} 
                message={message} 
                messageId={`message-${message.id}`}
              />
            ))}
            {isLoading && (
              <AiThinkingIndicator 
                processingDocument={documents.length > 0 || !!processingDocumentId}
                modelName={selectedModel?.name}
              />
            )}
          </div>
        </ScrollArea>

        {showDocuments && (
          <div className="w-64 border-l border-border p-3 overflow-y-auto">
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
        )}
      </div>

      <div className="p-4 border-t border-border bg-white">
        <div className="flex items-end gap-2">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedModel}
            onAttachClick={handleAttachClick}
            showAttachButton={true}
            ariaLabel="Type your message"
            inputId="chat-input-field"
            sendButtonAriaLabel="Send message"
            attachButtonAriaLabel="Attach document"
          />
          {isLoading && (
            <Button
              variant="outline"
              size="icon"
              onClick={stop}
              aria-label="Stop generation"
              aria-disabled={!isLoading}
            >
              <IconPlayerStop className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Stop message generation</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}