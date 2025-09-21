"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import { createLogger, generateRequestId } from "@/lib/client-logger"
import type { NotificationContextValue, UserNotification } from "@/types/notifications"

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const log = createLogger({ component: 'NotificationProvider' })

  const fetchNotifications = useCallback(async () => {
    const requestId = generateRequestId()
    const requestLog = createLogger({ component: 'NotificationProvider', requestId })

    try {
      requestLog.info('Fetching notifications')
      setError(null)

      const response = await fetch('/api/notifications', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // If unauthorized, just return empty notifications instead of throwing
        if (response.status === 401) {
          setNotifications([])
          setIsLoading(false)
          return
        }
        throw new Error(`Failed to fetch notifications: ${response.status}`)
      }

      const data = await response.json()

      if (!data.isSuccess) {
        throw new Error(data.message || 'Failed to fetch notifications')
      }

      setNotifications(data.data || [])
      requestLog.info('Notifications fetched successfully', {
        count: data.data?.length || 0
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      requestLog.error('Failed to fetch notifications', { error: errorMessage })
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const markAsRead = useCallback(async (notificationId: number) => {
    const requestId = generateRequestId()
    const requestLog = createLogger({ component: 'NotificationProvider', requestId })

    try {
      requestLog.info('Marking notification as read', { notificationId })

      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return // Silently fail for unauthenticated users
        }
        throw new Error(`Failed to mark notification as read: ${response.status}`)
      }

      const data = await response.json()

      if (!data.isSuccess) {
        throw new Error(data.message || 'Failed to mark notification as read')
      }

      // Update local state optimistically
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === notificationId
            ? { ...notification, status: 'read' as const }
            : notification
        )
      )

      requestLog.info('Notification marked as read successfully', { notificationId })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      requestLog.error('Failed to mark notification as read', {
        error: errorMessage,
        notificationId
      })
      setError(errorMessage)

      // Refresh notifications to get correct state
      await fetchNotifications()
    }
  }, [fetchNotifications])

  const markAllAsRead = useCallback(async () => {
    const requestId = generateRequestId()
    const requestLog = createLogger({ component: 'NotificationProvider', requestId })

    try {
      requestLog.info('Marking all notifications as read')

      const response = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return // Silently fail for unauthenticated users
        }
        throw new Error(`Failed to mark all notifications as read: ${response.status}`)
      }

      const data = await response.json()

      if (!data.isSuccess) {
        throw new Error(data.message || 'Failed to mark all notifications as read')
      }

      // Update local state optimistically
      setNotifications(prev =>
        prev.map(notification => ({ ...notification, status: 'read' as const }))
      )

      requestLog.info('All notifications marked as read successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      requestLog.error('Failed to mark all notifications as read', { error: errorMessage })
      setError(errorMessage)

      // Refresh notifications to get correct state
      await fetchNotifications()
    }
  }, [fetchNotifications])

  const refreshNotifications = useCallback(async () => {
    await fetchNotifications()
  }, [fetchNotifications])

  // Calculate unread count
  const unreadCount = notifications.filter(
    notification => notification.status !== 'read'
  ).length

  // Initial fetch on mount
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Set up periodic refresh (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading) {
        fetchNotifications()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchNotifications, isLoading])

  // Set up EventSource for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null

    const setupEventSource = () => {
      try {
        eventSource = new EventSource('/api/notifications/stream')

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            log.info('Received notification update', { type: data.type })

            if (data.type === 'notification_update') {
              // Refresh notifications when we get an update
              fetchNotifications()
            }
          } catch (err) {
            log.error('Failed to parse SSE message', {
              error: err instanceof Error ? err.message : 'Unknown error'
            })
          }
        }

        eventSource.onerror = (event) => {
          log.warn('SSE connection error, will retry', { event })
          eventSource?.close()

          // Retry connection after 5 seconds
          setTimeout(setupEventSource, 5000)
        }

        eventSource.onopen = () => {
          log.info('SSE connection established')
        }
      } catch (err) {
        log.error('Failed to setup SSE connection', {
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    // Only setup SSE if browser supports it
    if (typeof EventSource !== 'undefined') {
      setupEventSource()
    }

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [fetchNotifications, log])

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}