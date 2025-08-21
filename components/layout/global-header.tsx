"use client"

import Link from "next/link"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserButton } from "@/components/user/user-button"
import {
  Search,
  Sun,
  Globe,
  Bell,
  Mail,
  Bug,
  Check,
  X,
  Upload
} from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useState, useRef } from "react"
import { createFreshserviceTicketAction } from "@/actions/create-freshservice-ticket.actions"
// ... rest of imports ...

export function GlobalHeader() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4 md:px-6">
        {/* Left Section: Logo and Title */}
        <div className="mr-4 flex items-center">
          <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
            {/* Use the actual logo */}
            <Image
              src="/logo.png" // Use actual logo path
              alt="Logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain" // Adjust size as needed
            />
            {/* Change site name */}
            <span className="font-semibold text-lg inline-block">AI Studio</span>
          </Link>
        </div>

        {/* Center Section - Search */}
        <div className="flex flex-1 items-center justify-center space-x-2 ">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="h-9 w-full rounded-md border bg-card pl-8 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Right Section - Restore Icons */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" aria-label="Toggle Theme">
            <Sun className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Select Language">
            <Globe className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Messages">
            <Mail className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
          {/* Bug Report Dropdown - Always show for now, or add auth check if needed */}
          <BugReportPopover />
          <UserButton />
        </div>
      </div>
    </header>
  )
}

function BugReportPopover() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      // Check file size (10MB limit)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        setError("Screenshot must be smaller than 10MB")
        return
      }
      
      setScreenshot(file)
      setError(null)
      
      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else if (file) {
      setError("Only image files are supported")
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setScreenshot(file)
            setError(null)
            
            // Create preview URL
            const reader = new FileReader()
            reader.onloadend = () => {
              setScreenshotPreview(reader.result as string)
            }
            reader.readAsDataURL(file)
            break
          }
        }
      }
    }
  }

  const clearScreenshot = () => {
    setScreenshot(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Gather metadata
    const metadata = [
      '---',
      '**Debug Info**',
      `- Page: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `- User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      `- Platform: ${typeof navigator !== 'undefined' ? navigator.platform : ''}`,
      `- Screen: ${typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : ''}`,
      `- Timestamp: ${new Date().toISOString()}`,
      `- Locale: ${typeof navigator !== 'undefined' ? (navigator.language || (navigator.languages && navigator.languages[0]) || '') : ''}`,
      `- Referrer: ${typeof document !== 'undefined' ? document.referrer : ''}`
    ].join('\n')

    const fullDescription = `${description}\n\n${metadata}`

    // Prepare FormData for server action
    const formData = new FormData()
    formData.append('title', title)
    formData.append('description', fullDescription)
    
    if (screenshot) {
      formData.append('screenshot', screenshot)
    }

    const res = await createFreshserviceTicketAction(formData)
    setLoading(false)
    if (res.isSuccess) {
      setSuccess({ url: res.data.ticket_url })
      setTitle("")
      setDescription("")
      clearScreenshot()
    } else {
      setError(res.message || "Failed to create ticket.")
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Submit Issue">
          <Bug className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {success ? (
          <div className="flex flex-col items-center space-y-2">
            <Check className="h-8 w-8 text-green-500" />
            <div className="text-green-700 font-semibold">Ticket created!</div>
            <a
              href={success.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              View Ticket
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" onPaste={handlePaste}>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="Short summary"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                placeholder="Describe the issue or suggestion"
                disabled={loading}
              />
            </div>
            
            {/* Screenshot upload section */}
            <div>
              <label className="block text-sm font-medium mb-1">Screenshot (optional)</label>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload Screenshot
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  className="hidden"
                />
                
                {screenshotPreview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="max-w-full h-32 object-cover rounded border"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 bg-white/80 hover:bg-white"
                      onClick={clearScreenshot}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                <div className="text-xs text-muted-foreground">
                  Tip: You can also paste images directly (Ctrl/Cmd+V)
                </div>
              </div>
            </div>
            
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <Button type="submit" disabled={loading || !title || !description}>
              {loading ? "Creating ticket..." : "Create Ticket"}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
