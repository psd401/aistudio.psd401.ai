'use client';

import { useEffect, useState } from 'react';
import { AppShell, Grid } from '@mantine/core';
import { useUser } from '@clerk/nextjs';
import { Conversation } from '@/lib/schema';
import ConversationsList from './components/ConversationsList';
import ChatInterface from './components/ChatInterface';

export default function ChatPage() {
  const { user } = useUser();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    // Load conversations
    const loadConversations = async () => {
      const response = await fetch('/api/chat/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    };

    if (user) {
      loadConversations();
    }
  }, [user]);

  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    // Update the conversations list with the new title if it was edited
    setConversations(prevConvs => 
      prevConvs.map(conv => 
        conv.id === conversation.id ? conversation : conv
      )
    );
  };

  const handleConversationCreated = (conv: Conversation) => {
    setConversations([...conversations, conv]);
    setSelectedConversation(conv);
  };

  const handleNewConversation = () => {
    setSelectedConversation(null);
  };

  const handleDelete = (conversationId: number) => {
    setConversations(prevConvs => prevConvs.filter(conv => conv.id !== conversationId));
  };

  return (
    <AppShell>
      <Grid style={{ height: 'calc(100vh - 60px)' }}>
        <Grid.Col span={3} style={{ borderRight: '1px solid #eee', height: '100%' }}>
          <ConversationsList
            conversations={conversations}
            selectedConversation={selectedConversation}
            onSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            onDelete={handleDelete}
          />
        </Grid.Col>
        <Grid.Col span={9} style={{ height: '100%' }}>
          <ChatInterface
            conversation={selectedConversation}
            onConversationCreated={handleConversationCreated}
          />
        </Grid.Col>
      </Grid>
    </AppShell>
  );
} 