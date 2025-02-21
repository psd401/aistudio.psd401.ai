import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { IconTrash, IconEdit, IconCheck, IconX, IconPlus } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface Conversation {
  id: number;
  title: string;
  updatedAt: Date;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: number;
  onConversationSelect: (id: number) => void;
  onConversationDelete: (id: number) => Promise<void>;
  onConversationRename: (id: number, newTitle: string) => Promise<void>;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onConversationSelect,
  onConversationDelete,
  onConversationRename
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const { toast } = useToast();

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setNewTitle(conversation.title);
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await onConversationRename(id, newTitle);
      setEditingId(null);
      toast({
        title: 'Success',
        description: 'Conversation renamed successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to rename conversation',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await onConversationDelete(id);
      toast({
        title: 'Success',
        description: 'Conversation deleted successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="w-60 h-full flex flex-col">
      <h4 className="text-base font-medium px-1 mb-2">Previous Conversations</h4>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {conversations.map((conversation) => (
            <Card
              key={conversation.id}
              className={cn(
                "p-2 cursor-pointer relative min-w-0 hover:bg-accent",
                activeConversationId === conversation.id && "bg-accent"
              )}
              onClick={() => onConversationSelect(conversation.id)}
            >
              {editingId === conversation.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="flex-1 h-8"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(conversation.id);
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveEdit(conversation.id);
                    }}
                  >
                    <IconCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(null);
                    }}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm flex-1 break-words pr-16">
                    {conversation.title}
                  </p>
                  <div className="hover-visible absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-background rounded px-1 shadow-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(conversation);
                      }}
                    >
                      <IconEdit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(conversation.id);
                      }}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
} 