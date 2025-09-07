'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { ArchiveIcon, MessageSquareIcon } from 'lucide-react'
import { createLogger } from '@/lib/client-logger'

const log = createLogger({ moduleName: 'nexus-conversation-list' })

interface ConversationItem {
  id: string
  title: string
  provider: string
  modelUsed: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
  isArchived: boolean
  isPinned: boolean
}

interface ConversationListProps {
  onConversationSelect?: (conversationId: string | null) => void
  selectedConversationId?: string | null
}

export function ConversationList({ onConversationSelect, selectedConversationId }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  

  // Load conversations from database
  const loadConversations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      log.debug('Loading conversations from API')
      
      const response = await fetch('/api/nexus/conversations?limit=500')
      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.status}`)
      }
      
      const data = await response.json()
      const { conversations: loadedConversations = [] } = data
      
      setConversations(loadedConversations)
      log.debug('Conversations loaded', { count: loadedConversations.length })
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations'
      log.error('Failed to load conversations', { error: errorMessage })
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load conversations on component mount
  useEffect(() => {
    loadConversations()
  }, [loadConversations])


  // Handle selecting a conversation
  const handleConversationSelect = useCallback(async (conversationId: string) => {
    try {
      log.debug('Selecting conversation', { conversationId })
      
      // Notify parent component about the selection
      // The parent will handle loading messages and runtime remounting
      if (onConversationSelect) {
        onConversationSelect(conversationId)
      }
      
      log.debug('Conversation selected successfully', { conversationId })
      
    } catch (err) {
      log.error('Failed to select conversation', {
        conversationId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }, [onConversationSelect])

  // Handle archiving a conversation
  const handleArchiveConversation = useCallback(async (conversationId: string, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent triggering conversation selection
    
    try {
      log.debug('Archiving conversation', { conversationId })
      
      const response = await fetch(`/api/nexus/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to archive conversation: ${response.status}`)
      }
      
      // Remove from local state
      setConversations(prev => prev.filter(conv => conv.id !== conversationId))
      
      // If this was the selected conversation, clear selection
      if (selectedConversationId === conversationId && onConversationSelect) {
        onConversationSelect(null)
      }
      
      log.debug('Conversation archived successfully', { conversationId })
      
    } catch (err) {
      log.error('Failed to archive conversation', {
        conversationId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }, [selectedConversationId, onConversationSelect])

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = diffHours / 24
    
    if (diffHours < 1) {
      return 'Just now'
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-4">Failed to load conversations</p>
        <Button variant="outline" size="sm" onClick={loadConversations}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 text-foreground">
      {/* Conversations List */}
      {conversations.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquareIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No conversations yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Your conversations will appear here</p>
        </div>
      ) : (
        <>
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`
                flex items-center gap-2 rounded-lg transition-all cursor-pointer
                hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${selectedConversationId === conversation.id ? 'bg-muted' : ''}
              `}
              onClick={() => handleConversationSelect(conversation.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleConversationSelect(conversation.id)
                }
              }}
            >
              <div className="flex-grow px-3 py-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {conversation.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(conversation.lastMessageAt || conversation.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Archive Button */}
              <TooltipIconButton
                className="hover:text-foreground/60 text-foreground ml-auto mr-1 size-4 p-4"
                variant="ghost"
                tooltip="Archive conversation"
                onClick={(e) => handleArchiveConversation(conversation.id, e)}
              >
                <ArchiveIcon className="h-4 w-4" />
              </TooltipIconButton>
            </div>
          ))}
        </>
      )}
    </div>
  )
}