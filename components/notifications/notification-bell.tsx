"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Bell, CheckCircle, AlertCircle, Clock } from "lucide-react"
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
import { cn } from "@/lib/utils"
import type { NotificationBellProps, UserNotification } from "@/types/notifications"

export function NotificationBell({
  unreadCount,
  notifications,
  onMarkRead,
  onMarkAllRead,
  loading = false
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)

  const handleMarkRead = (notificationId: number, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    onMarkRead(notificationId)
  }

  const getStatusIcon = (notification: UserNotification) => {
    switch (notification.status) {
      case 'delivered':
      case 'sent':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />
      case 'read':
        return <CheckCircle className="h-3 w-3 text-gray-400" />
      default:
        return <Clock className="h-3 w-3 text-yellow-500" />
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes} minutes ago`
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
    }
  }

  const getNotificationMessage = (notification: UserNotification) => {
    const result = notification.executionResult
    if (!result) {
      return "Execution completed"
    }

    switch (result.status) {
      case 'success':
        return `${result.scheduleName} completed successfully`
      case 'failed':
        return `${result.scheduleName} failed`
      case 'running':
        return `${result.scheduleName} is running`
      default:
        return `${result.scheduleName} - status unknown`
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
          disabled={loading}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] sm:w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications {unreadCount > 0 && `(${unreadCount})`}</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                onMarkAllRead()
              }}
              className="h-auto p-1 text-xs"
            >
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <ScrollArea className="h-[300px] max-h-[50vh]">
            {notifications.slice(0, 10).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 cursor-pointer focus:bg-accent focus:text-accent-foreground",
                  notification.status === 'read' && "opacity-60"
                )}
                role="button"
                tabIndex={0}
                aria-label={`${getNotificationMessage(notification)} - ${notification.status === 'read' ? 'Read' : 'Mark as read'}`}
                onClick={(e) => {
                  if (notification.status !== 'read') {
                    handleMarkRead(notification.id, e)
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && notification.status !== 'read') {
                    e.preventDefault()
                    handleMarkRead(notification.id)
                  }
                }}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getStatusIcon(notification)}
                    <span className="text-sm font-medium truncate">
                      {getNotificationMessage(notification)}
                    </span>
                  </div>
                  {notification.status !== 'read' && (
                    <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground pl-5">
                  {formatTimeAgo(notification.createdAt)}
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  toast.info("View All Notifications page coming soon")
                  setOpen(false)
                }}
              >
                View All Notifications
              </Button>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}