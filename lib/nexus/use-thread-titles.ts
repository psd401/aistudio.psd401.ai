'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '@/lib/client-logger';

const log = createLogger({ moduleName: 'use-thread-titles' });

interface ThreadTitles {
  [threadId: string]: string;
}

/**
 * Hook to sync thread titles from database with runtime threads
 */
export function useThreadTitles() {
  const [titles, setTitles] = useState<ThreadTitles>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch titles from database
  const fetchTitles = useCallback(async () => {
    try {
      setIsLoading(true);
      log.info('Fetching conversation titles from API');
      
      const response = await fetch('/api/nexus/conversations');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
      }
      
      const data = await response.json();
      log.info('API response received', { 
        hasConversations: !!data.conversations, 
        conversationCount: data.conversations?.length || 0,
        sampleTitles: data.conversations?.slice(0, 3).map((c: any) => ({ id: c.id, title: c.title }))
      });
      
      const newTitles: ThreadTitles = {};
      
      // Map conversation IDs to titles
      if (data.conversations && Array.isArray(data.conversations)) {
        data.conversations.forEach((conv: { id: string; title: string }) => {
          if (conv.id && conv.title) {
            newTitles[conv.id] = conv.title;
          }
        });
      }
      
      setTitles(newTitles);
      log.info('Thread titles synced successfully', { 
        count: Object.keys(newTitles).length,
        titleSample: Object.entries(newTitles).slice(0, 3)
      });
      
    } catch (error) {
      log.error('Failed to fetch thread titles', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Sync titles when threads change
  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);
  
  // Get title for a specific thread - memoized to prevent infinite loops
  const getThreadTitle = useMemo(() => {
    return (threadId: string) => {
      return titles[threadId] || 'New Chat';
    };
  }, [titles]);
  
  return {
    titles,
    isLoading,
    getThreadTitle,
    refreshTitles: fetchTitles
  };
}