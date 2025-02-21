'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { Message as MessageType } from 'ai';
import { cn } from '@/lib/utils';

interface MessageProps {
  message: MessageType;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      "flex mb-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <Card className={cn(
        "max-w-[80%] border-0",
        isUser ? "bg-blue-50 dark:bg-blue-950" : "bg-muted",
        isUser ? "rounded-tr-sm" : "rounded-tl-sm"
      )}>
        <CardContent className="p-4">
          <p className="whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 