"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { IconMessage, IconPlus, IconTrash, IconEdit } from "@tabler/icons-react"
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
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  useEffect(() => {
    loadConversations()
  }, [])

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: SelectConversation[] } = {};
    conversations
      .sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()) // Sort newest first
      .forEach(conv => {
        // Ensure createdAt is a string before parsing
        const createdAtStr = typeof conv.createdAt === 'string' ? conv.createdAt : conv.createdAt.toISOString();
        const dateLabel = formatDateLabel(createdAtStr);
        if (!groups[dateLabel]) {
          groups[dateLabel] = [];
        }
        groups[dateLabel].push(conv);
      });
    return groups;
  }, [conversations]);

  async function loadConversations() {
    try {
      const response = await fetch("/api/conversations")
      if (!response.ok) throw new Error("Failed to load conversations")
      const data = await response.json()
      setConversations(data)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE"
      })
      if (!response.ok) throw new Error("Failed to delete conversation")
      setConversations(prev => prev.filter(c => c.id !== id))
      
      // If we're deleting the current conversation, redirect to /chat
      const currentConversationId = pathname.match(/\/chat\?conversation=(\d+)/)?.[1]
      if (currentConversationId && parseInt(currentConversationId) === id) {
        router.push("/chat")
      }

      toast({
        title: "Success",
        description: "Conversation deleted"
      })
    } catch (error) {
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

  return (
    <div className="flex flex-col h-full p-4 bg-muted/20 border-r border-border">
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(conversation.id);
                          toast({ title: "Edit clicked (not implemented)", description: `ID: ${conversation.id}` });
                        }}
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