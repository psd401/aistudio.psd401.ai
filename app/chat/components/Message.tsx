'use client';

import { Paper, Text } from '@mantine/core';
import type { Message as MessageType } from 'ai';

interface MessageProps {
  message: MessageType;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '16px'
    }}>
      <Paper
        p="md"
        style={{
          maxWidth: '80%',
          backgroundColor: isUser ? 'var(--mantine-color-blue-1)' : 'var(--mantine-color-gray-1)',
          borderRadius: '12px',
          borderTopRightRadius: isUser ? '4px' : '12px',
          borderTopLeftRadius: isUser ? '12px' : '4px'
        }}
      >
        <Text style={{ 
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {message.content}
        </Text>
      </Paper>
    </div>
  );
} 