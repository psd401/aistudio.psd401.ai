'use client';

import { useState } from 'react';
import { Paper, Group, ActionIcon, Tooltip, Text, Loader } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import { Message as MessageType } from 'ai';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface MessageProps {
  message: MessageType;
  key?: string;
}

export function Message({ message }: MessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper
      p="md"
      radius="md"
      style={{
        backgroundColor: message.role === 'user' ? '#f8f9fa' : '#f5f5f5',
        maxWidth: '85%',
        alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
        position: 'relative',
      }}
    >
      <Group align="flex-start" style={{ position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    {...props}
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code {...props} className={className}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>

          {/* Tool Invocations */}
          {message.role === 'assistant' && message.toolInvocations?.map((tool) => {
            const { toolName, toolCallId, state, result } = tool;

            if (state === 'preparing') {
              return (
                <Text key={toolCallId} size="sm" c="dimmed">
                  <Loader size="xs" mr="xs" /> Preparing {toolName}...
                </Text>
              );
            }

            if (state === 'running') {
              return (
                <Text key={toolCallId} size="sm" c="dimmed">
                  <Loader size="xs" mr="xs" /> Running {toolName}...
                </Text>
              );
            }

            if (state === 'error') {
              return (
                <Text key={toolCallId} size="sm" c="red">
                  Error running {toolName}: {tool.error?.message}
                </Text>
              );
            }

            if (state === 'result') {
              return (
                <Text key={toolCallId} size="sm" c="dimmed">
                  {toolName} completed successfully
                </Text>
              );
            }

            return null;
          })}
        </div>

        {message.role === 'assistant' && (
          <Tooltip label={copied ? "Copied!" : "Copy to clipboard"}>
            <ActionIcon 
              variant="subtle" 
              onClick={handleCopy}
              style={{ 
                position: 'absolute',
                top: 0,
                right: -30,
              }}
            >
              {copied ? (
                <IconCheck size={16} style={{ color: 'green' }} />
              ) : (
                <IconCopy size={16} />
              )}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
} 