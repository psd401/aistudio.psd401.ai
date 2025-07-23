"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { FileTextIcon, XIcon, UploadIcon, CheckCircleIcon, Loader2 } from "lucide-react"
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
}

export function DocumentUpload({ 
  conversationId, 
  onUploadComplete, 
  onFileSelected,
  externalInputRef, 
  pendingDocument
}: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadCompleted, setUploadCompleted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)
  const fileInputRef = externalInputRef ?? internalRef
  const hasAttemptedUpload = useRef(false)

  // Handle automatic upload when conversation ID is available
  useEffect(() => {
    if (conversationId && selectedFile && !hasAttemptedUpload.current) {
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
    
    
    let progressInterval: NodeJS.Timeout | null = null
    
    try {
      // Simulate upload progress
      progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = Math.min(prev + 10, 95)
          return newProgress
        })
      }, 300)
      
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      })
      
      clearInterval(progressInterval)
      progressInterval = null
      
      if (!response.ok) {
        let errMsg = `Server error (${response.status})`
        try {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const { error } = await response.json()
            if (error) errMsg = error
          } else {
            // If response is not JSON, try to read as text
            const text = await response.text()
            errMsg = `Server error: ${response.status} ${response.statusText}`
          }
        } catch (parseError) {
          // Keep the default error message
        }
        throw new Error(errMsg)
      }
      
      let data;
      try {
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid response format: expected JSON')
        }
        data = await response.json()
      } catch (parseError) {
        throw new Error('Invalid response format from server')
      }
      
      
      if (!data.success || !data.document) {
        throw new Error('Invalid response from server: Missing document information')
      }
      
      setUploadProgress(100)
      
      // Notify parent that upload finished, passing the document ID
      if (onUploadComplete) {
        onUploadComplete(data.document); // data.document should include the ID
      }
      
      // Mark upload as completed but keep the file info
      setUploadCompleted(true)
      setUploadProgress(100)
      hasAttemptedUpload.current = true;
      
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Failed to upload document',
        variant: "destructive"
      })
      hasAttemptedUpload.current = false;
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval)
      }
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const cancelSelection = () => { // Renamed for clarity
    setSelectedFile(null)
    setUploadCompleted(false)
    setPendingDocument(null) // Also clear pending state if user cancels
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadAnother = () => {
    setUploadCompleted(false)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
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
        <div className={`flex flex-col gap-2 p-3 border rounded-md transition-all ${
          uploadCompleted ? 'border-green-500/50 bg-green-50/10' : ''
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isUploading && !uploadCompleted && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {uploadCompleted && (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              )}
              {getFileIcon(selectedFile?.name || pendingDocument?.name || '')}
              <span className="text-sm font-medium truncate max-w-[150px]">
                {selectedFile?.name || pendingDocument?.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={uploadCompleted ? uploadAnother : cancelSelection}
              disabled={isUploading && !uploadCompleted}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          
          {isUploading && !uploadCompleted && (
            <div>
              <div className="w-full bg-secondary rounded-full h-1.5 dark:bg-secondary mb-1">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Processing document... {uploadProgress}%
              </p>
            </div>
          )}
          
          {uploadCompleted && (
            <div className="flex items-center justify-center gap-2">
              <p className="text-xs text-green-600 dark:text-green-400">
                Document processed successfully
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={uploadAnother}
                className="text-xs h-6 px-2"
              >
                Upload Another
              </Button>
            </div>
          )}
          
          {!isUploading && !uploadCompleted && pendingDocument?.id && !conversationId && (
            <p className="text-xs text-center text-muted-foreground my-1">
              Processed. Ready for chat.
            </p>
          )}
          {!isUploading && !uploadCompleted && !pendingDocument?.id && !conversationId && (
            <p className="text-xs text-center text-muted-foreground my-1">
              The document will be uploaded when you start a conversation
            </p>
          )}
        </div>
      )}
    </div>
  )
} 