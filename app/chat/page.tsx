'use client';

import { Group } from '@mantine/core';
import { Chat } from './components/Chat';
import { ConversationList } from './components/ConversationList';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Conversation {
  id: number;
  title: string;
  updatedAt: Date;
}

export default function ChatPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number>();

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const response = await fetch('/api/conversations');
    if (response.ok) {
      const data = await response.json();
      setConversations(data);
    }
  }

  async function handleDelete(id: number) {
    const response = await fetch(`/api/conversations/${id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      setConversations(conversations.filter(c => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(undefined);
      }
    }
  }

  async function handleRename(id: number, newTitle: string) {
    const response = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: newTitle }),
    });
    if (response.ok) {
      setConversations(conversations.map(c => 
        c.id === id ? { ...c, title: newTitle } : c
      ));
    }
  }

  function handleSelect(id: number) {
    setActiveConversationId(id);
    router.push(`/chat?conversation=${id}`);
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onConversationDelete={handleDelete}
        onConversationRename={handleRename}
        onConversationSelect={handleSelect}
      />
      <div style={{ flex: 1, height: '100%', maxWidth: 'calc(100% - 240px)' }}>
        <Chat conversationId={activeConversationId} />
      </div>
    </div>
  );
} 