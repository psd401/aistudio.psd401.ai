'use client'

import { createLogger } from '@/lib/client-logger'
import type { ThreadHistoryAdapter, ThreadMessage } from '@assistant-ui/react'
import { INTERNAL } from '@assistant-ui/react'

// Import ExportedMessageRepository type and utility
type ExportedMessageRepository = {
  headId?: string | null
  messages: Array<{
    message: ThreadMessage
    parentId: string | null
  }>
}

// We'll use a simple implementation since ExportedMessageRepository.fromArray may not be accessible
const createExportedMessageRepository = (messages: any[]): ExportedMessageRepository => ({
  messages: messages.map((msg, index) => ({
    message: INTERNAL.fromThreadMessageLike({
      id: msg.id,
      role: msg.role,
      content: msg.content || [{ type: 'text', text: '' }],
      ...(msg.createdAt && { createdAt: new Date(msg.createdAt) }),
    }, msg.id, { type: 'complete', reason: 'unknown' }),
    parentId: index === 0 ? null : messages[index - 1]?.id || null
  }))
})

// ExportedMessageRepositoryItem is not exported from the main module, so we'll define it based on the expected structure
type ExportedMessageRepositoryItem = {
  message: ThreadMessage
  parentId: string | null
}

const log = createLogger({ moduleName: 'nexus-history-adapter' })

/**
 * Manages conversation context and provides utilities for loading/saving conversation data
 */
export function useConversationContext() {
  let currentConversationId: string | null = null
  let onConversationChange: ((conversationId: string) => void) | undefined = undefined
  
  return {
    setConversationId(id: string | null) {
      if (currentConversationId !== id) {
        log.debug('Conversation context changed', { 
          from: currentConversationId, 
          to: id 
        })
        currentConversationId = id
        if (id && onConversationChange) {
          onConversationChange(id)
        }
      }
    },
    
    setOnConversationChange(callback: (conversationId: string) => void) {
      onConversationChange = callback
    },
    
    getCurrentConversationId(): string | null {
      return currentConversationId
    }
  }
}

/**
 * Creates a ThreadHistoryAdapter that loads and saves conversation messages
 */
export function createNexusHistoryAdapter(conversationId: string | null): ThreadHistoryAdapter {
  return {
    async load(): Promise<ExportedMessageRepository & { unstable_resume?: boolean }> {
      if (!conversationId) {
        log.debug('No conversation ID, returning empty repository')
        return { messages: [] }
      }

      try {
        log.debug('Loading conversation messages', { conversationId })
        
        const response = await fetch(`/api/nexus/conversations/${conversationId}/messages`)
        
        if (!response.ok) {
          if (response.status === 404) {
            log.warn('Conversation not found', { conversationId })
            return { messages: [] }
          }
          throw new Error(`Failed to load messages: ${response.status}`)
        }
        
        const data = await response.json()
        const { messages = [] } = data
        
        // Convert messages using our helper function
        const repository = createExportedMessageRepository(messages)
        
        log.debug('Messages loaded successfully', { 
          conversationId,
          messageCount: repository.messages.length
        })
        
        return repository
        
      } catch (error) {
        log.error('Failed to load conversation messages', {
          conversationId,
          error: error instanceof Error ? error.message : String(error)
        })
        
        return { messages: [] }
      }
    },

    async append(item: ExportedMessageRepositoryItem): Promise<void> {
      // Messages are already saved by the polling adapter in /api/nexus/chat
      // No need to save again - this prevents duplicates and API errors
      log.debug('Skipping message save - handled by polling adapter', {
        conversationId,
        messageRole: item.message.role,
        messageId: item.message.id
      })
      return
    }
  }
}

/**
 * Utilities for loading conversation messages and metadata
 */
export class ConversationLoader {
  static async loadConversation(conversationId: string) {
    try {
      log.debug('Loading conversation messages', { conversationId })
      
      const response = await fetch(`/api/nexus/conversations/${conversationId}/messages`)
      
      if (!response.ok) {
        if (response.status === 404) {
          log.warn('Conversation not found', { conversationId })
          return { messages: [], conversation: null }
        }
        throw new Error(`Failed to load messages: ${response.status}`)
      }
      
      const data = await response.json()
      const { messages = [], conversation } = data
      
      log.debug('Messages loaded successfully', { 
        conversationId,
        messageCount: messages.length,
        conversationTitle: conversation?.title
      })
      
      return { messages, conversation }
      
    } catch (error) {
      log.error('Failed to load conversation messages', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      })
      
      return { messages: [], conversation: null }
    }
  }

  static async saveMessage(conversationId: string, messageData: {
    messageId: string
    role: string
    content: string
    parts?: Array<{ type: string; text?: string; [key: string]: unknown }>
    metadata?: Record<string, unknown>
  }) {
    try {
      log.debug('Saving message to conversation', { 
        conversationId,
        messageRole: messageData.role,
        messageId: messageData.messageId
      })
      
      const response = await fetch('/api/nexus/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          ...messageData
        })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to save message: ${response.status}`)
      }
      
      log.debug('Message saved successfully', {
        conversationId,
        messageId: messageData.messageId
      })
      
      return true
      
    } catch (error) {
      log.error('Failed to save message', {
        conversationId,
        messageId: messageData.messageId,
        error: error instanceof Error ? error.message : String(error)
      })
      
      return false
    }
  }
}