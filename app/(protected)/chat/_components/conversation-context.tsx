"use client"

import React, { createContext, useContext, useCallback, useRef } from 'react'

interface ConversationContextType {
  refreshConversations: () => void
  registerRefreshFunction: (refreshFn: () => void) => () => void
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const refreshFunctionRef = useRef<(() => void) | null>(null)

  const registerRefreshFunction = useCallback((refreshFn: () => void) => {
    refreshFunctionRef.current = refreshFn
    
    // Return cleanup function
    return () => {
      if (refreshFunctionRef.current === refreshFn) {
        refreshFunctionRef.current = null
      }
    }
  }, [])

  const refreshConversations = useCallback(() => {
    if (refreshFunctionRef.current) {
      refreshFunctionRef.current()
    }
  }, [])

  return (
    <ConversationContext.Provider value={{ refreshConversations, registerRefreshFunction }}>
      {children}
    </ConversationContext.Provider>
  )
}

export function useConversationContext() {
  const context = useContext(ConversationContext)
  if (context === undefined) {
    throw new Error('useConversationContext must be used within a ConversationProvider')
  }
  return context
}