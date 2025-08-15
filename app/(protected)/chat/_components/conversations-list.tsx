"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { 
  IconMessage, 
  IconPlus, 
  IconTrash, 
  IconEdit, 
  IconCheck, 
  IconX, 
  IconRefresh, 
  IconBrain,
  IconSparkles,
  IconLoader2
} from "@tabler/icons-react"
import { useToast } from "@/components/ui/use-toast"
import type { SelectConversation } from "@/types"
import { format, isToday, isYesterday, parseISO } from "date-fns"
import { useConversationContext } from "./conversation-context"
import { motion, AnimatePresence } from "framer-motion"

// Helper function to format date labels
function formatDateLabel(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  if (isToday(date)) {
    return "Today"
  }
  if (isYesterday(date)) {
    return "Yesterday"
  }
  return format(date, "MMM dd, yyyy")
}

export function ConversationsList() {
  const [conversations, setConversations] = useState<SelectConversation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const { registerRefreshFunction } = useConversationContext()
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastFetchTimeRef = useRef<number>(0)

  const loadConversations = useCallback(async () => {
    if (!isRefreshing) {
      setIsLoading(true)
    }
    
    try {
      const response = await fetch("/api/conversations", {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        cache: 'no-store'
      })
      
      if (!response.ok) {
        throw new Error('Failed to load conversations')
      }
      
      const result = await response.json()
      const conversationsData = result.data || result
      
      if (Array.isArray(conversationsData)) {
        setConversations(conversationsData)
      } else {
        setConversations([])
      }
    } catch {
      if (isRefreshing) {
        toast({
          title: "Error",
          description: "Failed to refresh conversations",
          variant: "destructive"
        })
      }
      setConversations([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isRefreshing, toast])

  const refreshConversations = useCallback(async () => {
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 1000) {
      return
    }
    lastFetchTimeRef.current = now
    
    setIsRefreshing(true)
    await loadConversations()
  }, [loadConversations])

  useEffect(() => {
    loadConversations()
    
    const unregister = registerRefreshFunction(refreshConversations)
    
    // Reduced polling interval for better UX
    pollIntervalRef.current = setInterval(() => {
      if (!document.hidden && !isRefreshing) {
        refreshConversations()
      }
    }, 60000) // Poll every 60 seconds
    
    return () => {
      unregister()
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [refreshConversations, registerRefreshFunction, isRefreshing, loadConversations])

  // Group conversations by date with better error handling
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: SelectConversation[] } = {}
    
    if (!conversations || !Array.isArray(conversations) || conversations.length === 0) {
      return {}
    }
    
    try {
      [...conversations]
        .filter(conv => !deletingIds.has(conv.id)) // Filter out deleting conversations
        .sort((a, b) => {
          try {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0)
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0)
            return dateB.getTime() - dateA.getTime()
          } catch {
            return 0
          }
        })
        .forEach(conv => {
          try {
            const dateStr = conv.createdAt || new Date().toISOString()
            const dateLabel = formatDateLabel(dateStr)
            
            if (!groups[dateLabel]) {
              groups[dateLabel] = []
            }
            groups[dateLabel].push(conv)
          } catch {
            // Skip invalid conversation
          }
        })
    } catch {
      return {}
    }
    
    return groups
  }, [conversations, deletingIds])

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    
    // Optimistic update
    setDeletingIds(prev => new Set(prev).add(id))
    
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete conversation')
      }
      
      // Remove from state after successful delete
      setConversations(prev => prev.filter(c => c.id !== id))
      
      // Redirect if deleting current conversation
      const currentConversationId = pathname.match(/\/chat\?conversation=(\d+)/)?.[1]
      if (currentConversationId && parseInt(currentConversationId) === id) {
        router.push("/chat")
      }

      toast({
        title: "Success",
        description: "Conversation deleted"
      })
    } catch {
      // Revert optimistic update on error
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive"
      })
    }
  }

  async function handleNewChat() {
    router.push("/chat")
  }

  async function handleEdit(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    const conversation = conversations.find(c => c.id === id)
    if (conversation) {
      setEditingId(id)
      setEditingTitle(conversation.title)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editingTitle.trim()) return
    
    try {
      const response = await fetch(`/api/conversations/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() })
      })

      if (!response.ok) {
        throw new Error('Failed to update conversation')
      }

      // Update local state
      setConversations(prev => prev.map(conv => 
        conv.id === editingId ? { ...conv, title: editingTitle.trim() } : conv
      ))

      setEditingId(null)
      setEditingTitle("")

      toast({
        title: "Success",
        description: "Conversation renamed"
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to rename conversation",
        variant: "destructive"
      })
    }
  }

  function handleCancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(null)
    setEditingTitle("")
  }

  function handleConversationClick(conversationId: number) {
    router.push(`/chat?conversation=${conversationId}`)
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-background/95">
      {/* Header with gradient */}
      <div className="p-4 space-y-3 bg-gradient-to-b from-background via-background/95 to-transparent">
        <Button
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-lg transition-all hover:shadow-xl"
          onClick={handleNewChat}
        >
          <motion.div
            whileHover={{ rotate: 90 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <IconPlus className="h-4 w-4" />
          </motion.div>
          New Chat
          <IconSparkles className="h-4 w-4 text-primary-foreground/60" />
        </Button>
        
        {conversations.length > 5 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={async () => {
              if (confirm(`Delete all ${conversations.length} conversations? This cannot be undone.`)) {
                for (const conv of conversations) {
                  await handleDelete(conv.id, { stopPropagation: () => {} } as React.MouseEvent)
                }
              }
            }}
          >
            <IconTrash className="h-3.5 w-3.5 mr-1" />
            Clear All ({conversations.length})
          </Button>
        )}
        
        <div className="flex items-center justify-between px-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Conversations</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshConversations}
            disabled={isLoading || isRefreshing}
            className="h-7 w-7 p-0"
          >
            <IconRefresh className={cn(
              "h-4 w-4",
              (isLoading || isRefreshing) && "animate-spin"
            )} />
          </Button>
        </div>
      </div>

      {/* Conversations List with animations */}
      <ScrollArea className="flex-1 px-2">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-8"
            >
              <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </motion.div>
          ) : Object.keys(groupedConversations).length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8 px-4"
            >
              <IconMessage className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Start a new chat to begin
              </p>
            </motion.div>
          ) : (
            Object.entries(groupedConversations).map(([dateLabel, convs], groupIndex) => (
              <motion.div
                key={dateLabel}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.05 }}
                className="mb-4"
              >
                <p className="text-xs font-medium text-muted-foreground px-3 py-1.5">
                  {dateLabel}
                </p>
                <div className="space-y-1">
                  {convs.map((conversation, index) => (
                    <motion.div
                      key={conversation.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ 
                        opacity: deletingIds.has(conversation.id) ? 0.5 : 1,
                        x: deletingIds.has(conversation.id) ? -10 : 0
                      }}
                      transition={{ delay: index * 0.02 }}
                      whileHover={{ x: 4 }}
                      className={cn(
                        "group relative rounded-lg transition-all cursor-pointer",
                        pathname.includes(`conversation=${conversation.id}`)
                          ? "bg-gradient-to-r from-primary/20 to-primary/10 shadow-md"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => !editingId && !deletingIds.has(conversation.id) && handleConversationClick(conversation.id)}
                    >
                      <div className="px-3 py-2.5">
                        {editingId === conversation.id ? (
                          <form 
                            className="flex items-center gap-2 w-full"
                            onSubmit={handleSaveEdit}
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={e => {
                                e.stopPropagation()
                                if (e.key === 'Escape') {
                                  handleCancelEdit(e as unknown as React.MouseEvent)
                                }
                              }}
                              className="flex-1 bg-background text-sm rounded-md border border-input px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              autoFocus
                            />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-green-500/20"
                            >
                              <IconCheck className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-red-500/20"
                              onClick={handleCancelEdit}
                            >
                              <IconX className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-start gap-2 w-full pr-1">
                            <div className={cn(
                              "mt-0.5 p-1.5 rounded-lg flex-shrink-0",
                              pathname.includes(`conversation=${conversation.id}`)
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}>
                              <IconMessage className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <p className="text-sm font-medium break-words line-clamp-2">
                                {conversation.title}
                              </p>
                              {conversation.modelName && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <IconBrain className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground/60 truncate">
                                    {conversation.modelName}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Action buttons - Always visible */}
                            <div className={cn(
                              "flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                              deletingIds.has(conversation.id) 
                                ? "opacity-50 pointer-events-none"
                                : ""
                            )}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-muted"
                                onClick={(e) => handleEdit(conversation.id, e)}
                              >
                                <IconEdit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                                onClick={(e) => handleDelete(conversation.id, e)}
                              >
                                <IconTrash className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  )
}