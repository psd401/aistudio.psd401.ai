"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { IconMessage, IconPlus, IconTrash, IconEdit, IconCheck, IconX } from "@tabler/icons-react"
import { useToast } from "@/components/ui/use-toast"
import type { SelectConversation } from "@/types"
import { format, isToday, isYesterday, parseISO } from "date-fns"

// Helper function to format date labels
function formatDateLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) {
    return "Today";
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  return format(date, "dd/MM/yyyy");
}

export function ConversationsList() {
  const [conversations, setConversations] = useState<SelectConversation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  useEffect(() => {
    // Direct function call to ensure it runs immediately
    loadConversations();
    
    // No cleanup needed - the function handles its own cleanup internally
  }, [])

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: SelectConversation[] } = {};
    
    // Defensive check to prevent errors
    if (!conversations || !Array.isArray(conversations) || conversations.length === 0) {
      return {}; // Return empty groups object
    }
    
    try {
      // Create a sorted copy with safe operations
      [...conversations]
        .sort((a, b) => {
          // Extra safety to ensure we have valid objects
          if (!a || typeof a !== 'object') return 1;
          if (!b || typeof b !== 'object') return -1;
          
          // Handle edge cases for missing createdAt
          const hasCreatedAtA = a.createdAt !== undefined && a.createdAt !== null;
          const hasCreatedAtB = b.createdAt !== undefined && b.createdAt !== null;
          
          if (!hasCreatedAtA && !hasCreatedAtB) return 0;
          if (!hasCreatedAtA) return 1;
          if (!hasCreatedAtB) return -1;
          
          try {
            // Parse dates safely
            let dateA, dateB;
            
            try {
              dateA = typeof a.createdAt === 'string' 
                ? parseISO(a.createdAt) 
                : new Date(a.createdAt);
            } catch {
              dateA = new Date(0); // Default to epoch start if invalid
            }
            
            try {
              dateB = typeof b.createdAt === 'string' 
                ? parseISO(b.createdAt) 
                : new Date(b.createdAt);
            } catch {
              dateB = new Date(0); // Default to epoch start if invalid
            }
            
            // Ensure we have valid dates
            if (isNaN(dateA.getTime())) dateA = new Date(0);
            if (isNaN(dateB.getTime())) dateB = new Date(0);
            
            return dateB.getTime() - dateA.getTime(); // Sort newest first
          } catch {
            return 0; // Keep original order if comparison fails
          }
        })
        .forEach(conv => {
          try {
            // Skip invalid conversations
            if (!conv || typeof conv !== 'object' || !conv.id) {
              return;
            }
            
            // Default createdAt to current time if missing
            let dateStr = new Date().toISOString();
            
            // Try to get a valid date string
            if (conv.createdAt) {
              try {
                if (typeof conv.createdAt === 'string') {
                  dateStr = conv.createdAt;
                } else if (conv.createdAt instanceof Date) {
                  dateStr = conv.createdAt.toISOString();
                } else {
                  dateStr = new Date(conv.createdAt).toISOString();
                }
              } catch {
              }
            }
            
            // Get label and ensure it's valid
            const dateLabel = formatDateLabel(dateStr);
            
            // Create group if it doesn't exist
            if (!groups[dateLabel]) {
              groups[dateLabel] = [];
            }
            
            // Add conversation to group
            groups[dateLabel].push(conv);
          } catch {
          }
        });
    } catch {
      return {}; // Return empty groups in case of error
    }
    
    // Return the populated groups
    return groups;
  }, [conversations]);

  async function loadConversations() {
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/conversations");
      
      if (!response.ok) {
        setConversations([]);
        setIsLoading(false);
        return;
      }
      
      const result = await response.json();
      
      // Check if the result contains the data property (standard API response format)
      const conversationsData = result.data || result;
      
      
      if (Array.isArray(conversationsData)) {
        setConversations(conversationsData);
      } else {
        setConversations([]);
      }
    } catch {
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    
    // Create abort controller for timeout and cleanup
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Set timeout to prevent hanging delete request
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, 8000); // 8 second timeout
      
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Clear timeout since request completed
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Handle non-200 responses with detailed error info
      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.status} ${response.statusText}`);
      }
      
      // Update local state to remove the deleted conversation
      setConversations(prev => prev.filter(c => c.id !== id));
      
      // If we're deleting the current conversation, redirect to /chat
      const currentConversationId = pathname.match(/\/chat\?conversation=(\d+)/)?.[1];
      if (currentConversationId && parseInt(currentConversationId) === id) {
        window.location.href = "/chat";
      }

      toast({
        title: "Success",
        description: "Conversation deleted"
      });
    } catch (error) {
      // Only show error toast if it wasn't an abort
      if (error instanceof Error && error.name !== 'AbortError') {
        toast({
          title: "Error",
          description: "Failed to delete conversation",
          variant: "destructive"
        });
      }
    } finally {
      // Final cleanup of any remaining timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function handleNewChat() {
    window.location.href = "/chat"
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
    e.preventDefault();
    if (!editingId) return;
    
    // Don't save empty titles
    if (!editingTitle.trim()) {
      toast({
        title: "Error",
        description: "Conversation title cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    // Create abort controller for timeout and cleanup
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Set timeout to prevent hanging save request
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, 8000); // 8 second timeout
      
      const response = await fetch(`/api/conversations/${editingId}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title: editingTitle.trim() }),
        signal: abortController.signal
      });
      
      // Clear timeout since request completed
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        throw new Error(`Failed to update conversation: ${response.status} ${response.statusText}`);
      }

      // Try to parse response just to validate it
      try {
        await response.json();
      } catch {
      }

      // Update local state
      setConversations(prev => prev.map(conv => 
        conv.id === editingId ? { ...conv, title: editingTitle.trim() } : conv
      ));

      // Reset editing state
      setEditingId(null);
      setEditingTitle("");

      toast({
        title: "Success",
        description: "Conversation renamed"
      });
    } catch (error) {
      // Only show error toast if it wasn't an abort
      if (error instanceof Error && error.name !== 'AbortError') {
        toast({
          title: "Error",
          description: "Failed to rename conversation",
          variant: "destructive"
        });
      }
    } finally {
      // Final cleanup of any remaining timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // If this was an abort, we need to reset the editing state
      if (abortController.signal.aborted) {
        setEditingId(null);
        setEditingTitle("");
      }
    }
  }

  async function handleCancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(null)
    setEditingTitle("")
  }

  return (
    <div className="flex flex-col h-full p-4 bg-white">
      <Button
        className="flex items-center justify-center gap-2 mb-4 w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={handleNewChat}
      >
        <IconPlus className="h-4 w-4" />
        New Chat
      </Button>

      <ScrollArea className="flex-1 -mr-2">
        <div className="space-y-1 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : Object.keys(groupedConversations).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No conversations yet
            </p>
          ) : (
            Object.entries(groupedConversations).map(([dateLabel, convs]) => (
              <div key={dateLabel} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-3 py-1 mt-2">
                  {dateLabel}
                </p>
                {convs.map((conversation) => (
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group relative w-full flex items-start gap-3 px-3 py-2 text-sm rounded-md border border-transparent cursor-pointer transition-colors",
                      pathname === `/chat/${conversation.id}`
                        ? "bg-primary/10 text-primary font-medium border-primary/20"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => router.push(`/chat?conversation=${conversation.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/chat?conversation=${conversation.id}`);
                      }
                    }}
                  >
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
                            e.stopPropagation();
                            if (e.key === 'Escape') {
                              handleCancelEdit(e as unknown as React.MouseEvent);
                            }
                          }}
                          className="flex-1 bg-background text-sm rounded border border-input px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-muted"
                        >
                          <IconCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-destructive/10 text-destructive"
                          onClick={handleCancelEdit}
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 w-[calc(100%-60px)]">
                          <IconMessage className="h-4 w-4 shrink-0 mt-0.5" />
                          <span className="break-words">
                            {conversation.title}
                          </span>
                        </div>
                        
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-inherit">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-muted"
                            onClick={(e) => handleEdit(conversation.id, e)}
                            aria-label="Edit conversation title"
                          >
                            <IconEdit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-destructive/10 text-destructive"
                            onClick={(e) => handleDelete(conversation.id, e)}
                            aria-label="Delete conversation"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
} 