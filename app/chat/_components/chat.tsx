"use client"

import { useEffect, useRef, useState } from "react"
import { Message } from "./message"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { DocumentUpload } from "./document-upload"
import { DocumentList } from "./document-list"
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
  title?: string
  initialMessages?: Array<{
    id: string
    content: string
    role: "user" | "assistant"
  }>
}

export function Chat({ conversationId: initialConversationId, title, initialMessages = [] }: ChatProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [currentConversationId, setCurrentConversationId] = useState<number | undefined>(initialConversationId)
  const [models, setModels] = useState<SelectAiModel[]>([])
  const [selectedModel, setSelectedModel] = useState<SelectAiModel | null>(null)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<Document | null>(null)
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const hiddenFileInputRef = useRef<HTMLInputElement>(null)
  
  // Track if we have a new conversation that needs document upload
  const needsDocumentUploadRef = useRef<boolean>(false)

  useEffect(() => {
    console.log("[Chat] initialMessages prop changed, updating state:", initialMessages);
    setMessages(initialMessages);
  }, [initialMessages]);

  // Add a new effect to track changes to initialConversationId
  useEffect(() => {
    console.log("[Chat] initialConversationId changed:", initialConversationId);
    setCurrentConversationId(initialConversationId);
    
    // Clear pending document state when switching conversations
    setPendingDocument(null);
    setProcessingDocumentId(null);
    
    // Reset document upload ref
    needsDocumentUploadRef.current = false;
    
    // Instead of setting documents to empty, trigger a fetch if we have an ID
    if (initialConversationId) {
      console.log("[Chat] Fetching documents for initial conversation ID:", initialConversationId);
      
      // Add proper cleanup for fetch operations
      const abortController = new AbortController();
      fetchDocuments(initialConversationId, abortController.signal);
      
      return () => {
        // Cancel any in-flight fetch requests when component unmounts or ID changes
        abortController.abort();
      };
    } else {
      // Only clear documents if we don't have a conversation ID
      setDocuments([]);
    }
  }, [initialConversationId]);

  // Separate effect for handling pending documents
  useEffect(() => {
    // If we have a pending document and a conversation ID, we should upload it
    if (pendingDocument && currentConversationId) {
      console.log("[Chat] Conversation ID received and pending document exists, triggering upload");
      toast({
        title: "Uploading document",
        description: `Uploading ${pendingDocument.name} to conversation`,
        variant: "default"
      });
      // We'll handle this via the DocumentUpload component's useEffect
      needsDocumentUploadRef.current = true;
    }
  }, [currentConversationId, pendingDocument, toast]);

  // Add a useEffect to log and auto-show documents when they're available
  useEffect(() => {
    console.log("[Chat] Documents state changed:", documents);
    if (documents.length > 0) {
      console.log("[Chat] Auto-showing document panel because documents are available");
      setShowDocuments(true);
    }
  }, [documents]);

  const fetchDocuments = async (convId?: number, signal?: AbortSignal) => {
    const idToUse = convId || currentConversationId;
    if (!idToUse) return;

    try {
      console.log(`[fetchDocuments] Fetching documents for conversation: ${idToUse}`);
      const response = await fetch(`/api/documents?conversationId=${idToUse}`, {
        // Add cache buster to ensure we get fresh data
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        cache: 'no-store',
        signal: signal // Add AbortSignal to allow cancellation
      });
      
      if (!response.ok) throw new Error("Failed to fetch documents");
      
      const data = await response.json();
      console.log(`[fetchDocuments] Response data:`, data);
      
      if (data.success && data.documents) {
        console.log(`[fetchDocuments] Retrieved ${data.documents.length} documents`);
        if (data.documents.length > 0) {
          setDocuments(data.documents);
          setShowDocuments(true);
        } else {
          setDocuments([]);
        }
      } else {
        console.log(`[fetchDocuments] No documents returned or success is false:`, data);
        setDocuments([]);
      }
    } catch (error) {
      console.error('[fetchDocuments] Error:', error);
      setDocuments([]);
    }
  };

  // Add a function to force document refresh
  const forceDocumentRefresh = () => {
    console.log("[Chat] Force refreshing documents");
    if (currentConversationId) {
      fetchDocuments(currentConversationId);
    }
  };

  const handleDocumentUpload = (documentInfo: Document) => {
    console.log("[handleDocumentUpload] Document uploaded:", documentInfo);
    
    // Save the document to our state
    setDocuments(prev => {
      // Check if it's already in the list to avoid duplicates
      const exists = prev.some(doc => doc.id === documentInfo.id);
      if (exists) return prev;
      return [...prev, documentInfo];
    });
    
    // Clear the pending document since it's been uploaded
    setProcessingDocumentId(documentInfo.id);
    setPendingDocument(null);
    
    // Show the documents panel
    setShowDocuments(true);
    
    // If we have a conversation ID, refetch documents to ensure we have the latest state
    if (currentConversationId) {
      fetchDocuments();
    }
    
    toast({
      title: "Document uploaded",
      description: `${documentInfo.name} has been uploaded successfully`,
      variant: "default"
    });
  }
  
  const handleDocumentSelected = (documentInfo: Partial<Document>) => {
    console.log("[handleDocumentSelected] Document selected:", documentInfo);
    
    // We just need to know the file details to show pending state
    setPendingDocument(documentInfo as Document); // Store details for UI
    // Upload is now triggered directly from DocumentUpload component
  }

  const handleDocumentDelete = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents?id=${documentId}`, {
        method: "DELETE"
      })
      
      if (!response.ok) throw new Error("Failed to delete document")
      
      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      return true
    } catch (error) {
      console.error('[handleDocumentDelete] Error:', error)
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      })
      throw error
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

    console.log('[handleSubmit] Starting submission with model:', selectedModel)
    setIsLoading(true)
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: input
    }
    // Add user message immediately
    setMessages(prev => [...prev, userMessage]) 
    const currentInput = input; // Store input before clearing
    setInput("")

    try {
      console.log('[handleSubmit] Sending request:', {
        messages: [...messages, userMessage],
        conversationId: currentConversationId,
        modelId: selectedModel.modelId,
        includeDocumentContext: true,
        documentId: currentConversationId === undefined && processingDocumentId ? processingDocumentId : undefined
      })
      
      const currentId = currentConversationId;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          conversationId: currentId,
          modelId: selectedModel.modelId,
          includeDocumentContext: true,
          documentId: currentId === undefined && processingDocumentId ? processingDocumentId : undefined
        })
      })

      console.log('[handleSubmit] Response status:', response.status)
      const contentType = response.headers.get('Content-Type')
      console.log('[handleSubmit] Response content type:', contentType)

      if (!response.ok) {
        let errorMessage = response.statusText
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
        }
        throw new Error(errorMessage)
      }

      let assistantText = "";
      let newConversationId: number | undefined = currentConversationId;
      const respType = contentType || "";

      if (respType.includes("application/json")) {
        const data = await response.json();
        console.log('[handleSubmit] JSON Response data:', data);
        
        // The API returns a response with data.data.text structure based on the withErrorHandling wrapper
        if (data && data.data && data.data.text) {
          console.log('[handleSubmit] Found text in data.data.text');
          assistantText = data.data.text;
        } else if (data && data.success === true && data.data) {
          // Explore the data structure if it matches the standard API response format
          console.log('[handleSubmit] Exploring data structure in standard response format');
          
          if (typeof data.data === 'string') {
            // If data.data is directly a string
            assistantText = data.data;
          } else if (data.data && typeof data.data === 'object') {
            // Look for text in common properties
            assistantText = data.data.text || data.data.content || data.data.message || "";
            
            // Try to find the first string property that might be the response
            if (!assistantText) {
              for (const key in data.data) {
                if (typeof data.data[key] === 'string' && data.data[key].length > 20) {
                  console.log(`[handleSubmit] Using string property: ${key}`);
                  assistantText = data.data[key];
                  break;
                }
              }
            }
          }
        } else {
          // Fallbacks for non-standard response structures
          assistantText = data.text || 
                          data.content || 
                          (data.message && data.message.content) ||
                          "";
        }
        
        console.log('[handleSubmit] Final extracted assistant text:', assistantText);
        
        // If we still don't have text, use a fallback message
        if (!assistantText) {
          console.warn('[handleSubmit] Could not find response text in data structure');
          assistantText = "Sorry, there was an issue displaying the response.";
        }
        
        if (!currentConversationId && data.conversationId) {
          newConversationId = data.conversationId;
          // Update state *before* URL change
          setCurrentConversationId(newConversationId); 
          if(processingDocumentId) setProcessingDocumentId(null); 
          // Update the URL *after* state is likely processed
          window.history.pushState({}, '', `/chat?conversation=${newConversationId}`);
        } else if (!currentConversationId && data.data && data.data.conversationId) {
          // Try alternate location for conversationId
          newConversationId = data.data.conversationId;
          setCurrentConversationId(newConversationId);
          if(processingDocumentId) setProcessingDocumentId(null);
          window.history.pushState({}, '', `/chat?conversation=${newConversationId}`);
        }
      } else {
        // For non-JSON responses
        const responseText = await response.text();
        console.log('[handleSubmit] Text response:', responseText);
        assistantText = responseText;
      }

      // Add the final assistant message directly
      const assistantMessage = {
        id: crypto.randomUUID(), // Generate ID here
        role: "assistant" as const,
        content: assistantText
      };
      
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('[handleSubmit] Error:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      })
      // Restore user message and input on error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id)); 
      setInput(currentInput) 
    } finally {
      setIsLoading(false)
      // Scroll logic remains the same
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        })
      }
    }
  }

  useEffect(() => {
    async function loadModels() {
      try {
        console.log('[loadModels] Fetching models from API');
        const response = await fetch("/api/models");
        
        if (!response.ok) {
          console.error(`[loadModels] Error: ${response.status} ${response.statusText}`);
          return;
        }
        
        const result = await response.json();
        
        // Check if the result contains the data property (standard API response format)
        const modelsData = result.data || result;
        
        console.log('[loadModels] Models loaded:', modelsData);
        
        if (!Array.isArray(modelsData) || modelsData.length === 0) {
          console.warn('[loadModels] No models returned from API or invalid format');
          return;
        }
        
        // Filter models with chatEnabled set to true
        const chatModels = modelsData.filter(model => model.chatEnabled === true);
        
        console.log('[loadModels] Chat-enabled models:', chatModels);
        
        if (chatModels.length > 0) {
          setModels(chatModels);
          setSelectedModel(chatModels[0]);
        } else {
          console.warn('[loadModels] No chat-enabled models found');
        }
      } catch (error) {
        console.error('[loadModels] Error:', error);
        toast({
          title: "Error",
          description: "Failed to load models",
          variant: "destructive"
        });
      }
    }
    
    loadModels();
  }, [toast])

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
    // Only trigger file dialog if there's no pending document
    if (!pendingDocument) {
      hiddenFileInputRef.current?.click()
    }
  }

  const onPaperclipClick = () => {
    handleAttachClick();
  }

  // No need for fallbacks - if models aren't loaded yet, we'll show an empty state
  
  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg shadow-sm overflow-hidden">
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
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div role="list" aria-label="Chat messages">
            {messages.map((message) => (
              <Message 
                key={message.id} 
                message={message} 
                messageId={`message-${message.id}`}
              />
            ))}
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
                onRefresh={() => fetchDocuments()}
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-end gap-2">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedModel}
            onAttachClick={onPaperclipClick}
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
              onClick={() => setIsLoading(false)}
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