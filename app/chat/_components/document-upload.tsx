"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PaperclipIcon, FileTextIcon, XIcon, UploadIcon } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

interface Document {
  id: string
  name: string
  type: string
  url: string
}

interface DocumentUploadProps {
  conversationId?: number
  externalInputRef?: React.RefObject<HTMLInputElement>
  onUploadComplete: (documentInfo: Document) => void
  onFileSelected?: (documentInfo: Partial<Document>) => void
  pendingDocument?: Partial<Document> | null
  needsUpload?: boolean
}

export function DocumentUpload({ 
  conversationId, 
  onUploadComplete, 
  onFileSelected,
  externalInputRef, 
  pendingDocument,
  needsUpload = false
}: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)
  const fileInputRef = externalInputRef ?? internalRef
  const hasAttemptedUpload = useRef(false)

  // Handle automatic upload when conversation ID is available
  useEffect(() => {
    if (conversationId && selectedFile && !hasAttemptedUpload.current) {
      console.log("[DocumentUpload] Triggering upload for selectedFile since conversation ID is available");
      hasAttemptedUpload.current = true;
      uploadDocument(selectedFile);
    }
  }, [conversationId, selectedFile]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }

  const validateAndSetFile = (file: File) => {
    // Check file type
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedTypes = ['pdf', 'docx', 'txt'];
    
    if (!allowedTypes.includes(fileExt)) {
      toast({
        title: "Invalid file type",
        description: "Please select a PDF, DOCX, or TXT file",
        variant: "destructive"
      })
      return
    }
    
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB",
        variant: "destructive"
      })
      return
    }
    
    setSelectedFile(file)
    hasAttemptedUpload.current = false;
    
    // Notify parent that a file was selected
    if (onFileSelected) {
      onFileSelected({ 
        name: file.name,
        type: fileExt
      });
    }
    
    // Just set the file, upload triggered elsewhere or by button
    setSelectedFile(file);
    
    // Trigger upload immediately
    hasAttemptedUpload.current = false; // Reset attempt flag
    uploadDocument(file); // Pass file to upload function
  }

  const uploadDocument = async (fileToUpload: File | null) => {
    if (!fileToUpload) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive"
      })
      return
    }
    
    setIsUploading(true)
    setUploadProgress(0)
    
    const formData = new FormData()
    formData.append('file', fileToUpload)
    
    console.log(`Uploading document ${fileToUpload.name}`)
    
    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = Math.min(prev + 10, 95)
          return newProgress
        })
      }, 300)
      
      console.log(`[DocumentUpload] Attempting POST to /api/documents/upload with file: ${fileToUpload.name}`);
      console.log('Sending document upload request...')
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      })
      
      clearInterval(progressInterval)
      
      if (!response.ok) {
        let errMsg = `Server error (${response.status})`
        try {
          const { error } = await response.json()
          if (error) errMsg = error
        } catch {/* response wasn't JSON */}
        console.error('Upload response not OK:', response.status, errMsg)
        throw new Error(errMsg)
      }
      
      const data = await response.json()
      console.log('Upload successful, response data:', data)
      
      if (!data.success || !data.document) {
        throw new Error('Invalid response from server: Missing document information')
      }
      
      setUploadProgress(100)
      
      // Notify parent that upload finished, passing the document ID
      if (onUploadComplete) {
        onUploadComplete(data.document); // data.document should include the ID
      }
      
      setSelectedFile(null)
      setUploadProgress(0)
      hasAttemptedUpload.current = true;
      
    } catch (error) {
      console.error('Error uploading document:', error)
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Failed to upload document',
        variant: "destructive"
      })
      hasAttemptedUpload.current = false;
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const cancelSelection = () => { // Renamed for clarity
    setSelectedFile(null)
    setPendingDocument(null) // Also clear pending state if user cancels
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
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

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium mb-1">Upload Document</h3>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.txt"
      />
      
      {!selectedFile && !pendingDocument && (
        <div
          className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <UploadIcon className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm mt-2 text-muted-foreground">
            Drag & drop or click to upload<br />
            <span className="text-xs">(PDF, DOCX, TXT up to 10MB)</span>
          </p>
        </div>
      )}
      
      {(selectedFile || pendingDocument) && (
        <div className="flex flex-col gap-2 p-3 border rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getFileIcon(selectedFile?.name || pendingDocument?.name || '')}
              <span className="text-sm font-medium truncate max-w-[150px]">
                {selectedFile?.name || pendingDocument?.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={cancelSelection}
              disabled={isUploading}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          
          {isUploading && (
            <div>
              <div className="w-full bg-secondary rounded-full h-1.5 dark:bg-secondary mb-1">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-right text-muted-foreground">{uploadProgress}%</p>
            </div>
          )}
          
          {!isUploading && pendingDocument?.id && !conversationId && (
            <p className="text-xs text-center text-muted-foreground my-1">
              Processed. Ready for chat.
            </p>
          )}
          {!isUploading && !pendingDocument?.id && !conversationId && (
            <p className="text-xs text-center text-muted-foreground my-1">
              The document will be uploaded when you start a conversation
            </p>
          )}
        </div>
      )}
    </div>
  )
} 