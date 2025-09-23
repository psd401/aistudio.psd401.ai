"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Mail, CheckCircle, XCircle, RotateCcw, Download, Eye, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MessageCenterProps } from "@/types/notifications"

export function MessageCenter({
  messages,
  onViewResult,
  onRetryExecution,
  onDeleteResult,
  loading = false
}: MessageCenterProps) {
  const [open, setOpen] = useState(false)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />
      case 'running':
        return <RotateCcw className="h-3 w-3 text-blue-500 animate-spin" />
      default:
        return <div className="h-3 w-3 bg-gray-400 rounded-full" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return 'Success'
      case 'failed':
        return 'Failed'
      case 'running':
        return 'Running'
      default:
        return 'Unknown'
    }
  }

  const formatExecutionTime = (dateString: string) => {
    const utcDate = new Date(dateString)

    // Format in local timezone (browser automatically handles the conversion)
    return utcDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  const handleViewResult = (resultId: number, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onViewResult(resultId)
    setOpen(false)
  }

  const handleRetryExecution = (scheduledExecutionId: number, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (onRetryExecution) {
      onRetryExecution(scheduledExecutionId)
    }
    setOpen(false)
  }

  const handleDeleteResult = (resultId: number, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (onDeleteResult) {
      // Show confirmation dialog
      if (confirm("Are you sure you want to delete this execution result? This action cannot be undone.")) {
        onDeleteResult(resultId)
      }
    }
    setOpen(false)
  }

  const recentMessages = messages.slice(0, 10)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Messages & Results"
          disabled={loading}
        >
          <Mail className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)] sm:w-96">
        <DropdownMenuLabel>
          Messages & Results
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading messages...
          </div>
        ) : recentMessages.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No execution results yet
          </div>
        ) : (
          <ScrollArea className="h-[400px] max-h-[60vh]">
            {recentMessages.map((message) => (
              <DropdownMenuItem
                key={message.id}
                className="flex flex-col items-start gap-2 p-3 cursor-pointer"
                asChild
              >
                <div>
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getStatusIcon(message.status)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {message.scheduleName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {message.assistantArchitectName}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={message.status === 'success' ? 'default' :
                               message.status === 'failed' ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {getStatusText(message.status)}
                    </Badge>
                  </div>

                  <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                    <span>{formatExecutionTime(message.executedAt)}</span>
                    {message.executionDurationMs && (
                      <span>{Math.round(message.executionDurationMs / 1000)}s</span>
                    )}
                  </div>

                  <div className="flex w-full gap-1 mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs flex-1"
                      onClick={(e) => handleViewResult(message.id, e)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View Details
                    </Button>

                    {message.status === 'failed' && onRetryExecution && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => handleRetryExecution(message.scheduledExecutionId, e)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        // Trigger download using existing API endpoint
                        const downloadUrl = `/api/execution-results/${message.id}/download`
                        const link = document.createElement('a')
                        link.href = downloadUrl
                        link.download = `${message.scheduleName}-${new Date(message.executedAt).toISOString().slice(0, 10)}.md`
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        toast.success("Download started")
                      }}
                    >
                      <Download className="h-3 w-3" />
                    </Button>

                    {onDeleteResult && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => handleDeleteResult(message.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}

        {recentMessages.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  toast.info("View All Results page coming soon")
                  setOpen(false)
                }}
              >
                View All Results
              </Button>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}