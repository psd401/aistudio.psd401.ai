"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { FileTextIcon, Trash2Icon, RefreshCwIcon, ClockIcon } from "lucide-react"

interface Document {
  id: string
  name: string
  type: string
  url: string
  size?: number
  createdAt?: string
}

interface DocumentListProps {
  conversationId?: number
  documents?: Document[]
  onDeleteDocument?: (documentId: string) => void
}

export function DocumentList({ 
  conversationId, 
  documents: initialDocuments,
  onDeleteDocument 
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments || [])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (initialDocuments) {
      setDocuments(initialDocuments)
    } else if (conversationId) {
      fetchDocuments()
    }
  }, [conversationId, initialDocuments])

  const fetchDocuments = async () => {
    if (!conversationId) return;
    
    setIsLoading(true)
    try {
      const response = await fetch(`/api/documents?conversationId=${conversationId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    if (!onDeleteDocument) return

    try {
      await onDeleteDocument(documentId)
      setDocuments(docs => docs.filter(doc => doc.id !== documentId))
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase()
    
    switch (extension) {
      case 'pdf':
        return <FileTextIcon className="h-4 w-4 text-red-500" />
      case 'docx':
        return <FileTextIcon className="h-4 w-4 text-blue-500" />
      case 'txt':
        return <FileTextIcon className="h-4 w-4 text-gray-500" />
      default:
        return <FileTextIcon className="h-4 w-4" />
    }
  }

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size'
    
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDocumentClick = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents?id=${doc.id}`);
      if (!response.ok) throw new Error('Failed to fetch document');
      const data = await response.json();
      if (data.success && data.document) {
        // Open document in new tab
        window.open(data.document.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Error accessing document:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <RefreshCwIcon className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center p-4 text-sm text-muted-foreground">
        No documents uploaded yet
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Documents</h3>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div 
            key={doc.id}
            className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {getFileIcon(doc.name)}
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {doc.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(doc.size)}
                </span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDocumentClick(doc)}
              >
                <span className="sr-only">Open</span>
                <FileTextIcon className="h-4 w-4" />
              </Button>
              
              {onDeleteDocument && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={() => handleDeleteDocument(doc.id)}
                >
                  <span className="sr-only">Delete</span>
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 