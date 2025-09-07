'use client'

import { createLogger } from '@/lib/client-logger'

const log = createLogger({ moduleName: 'nexus-conversation-manager' })

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