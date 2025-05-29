"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, FileUp } from "lucide-react"
import { toast } from "sonner"

interface PdfUploadButtonProps {
  onMarkdown: (markdown: string) => void
  label?: string
  className?: string
  disabled?: boolean
}

export default function PdfUploadButton({
  onMarkdown,
  label = "Add PDF Knowledge",
  className = "",
  disabled = false
}: PdfUploadButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleButtonClick = () => {
    if (fileInputRef.current) fileInputRef.current.value = ""
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported.")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File size exceeds 25MB limit.")
      return
    }
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/assistant-architect/pdf-to-markdown", {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to process PDF.")
      }
      const docTag = `<pdf-document title="${file.name}">\n${data.markdown}\n</pdf-document>`
      onMarkdown(docTag)
      toast.success("PDF content added to system context.")
    } catch (err: any) {
      toast.error(err.message || "Failed to process PDF.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload PDF"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleButtonClick}
        disabled={isLoading || disabled}
        className="flex items-center gap-2"
        aria-label={label}
      >
        {isLoading ? (
          <Loader2 className="animate-spin h-4 w-4 mr-2" />
        ) : (
          <FileUp className="h-4 w-4 mr-2" />
        )}
        {label}
      </Button>
    </div>
  )
} 