'use client'

import { useState, useEffect, useCallback } from 'react';
import { useThreadList } from '@assistant-ui/react';
import { createLogger } from '@/lib/client-logger';

const log = createLogger({ moduleName: 'use-thread-titles' });

interface ThreadTitles {
  [threadId: string]: string;
}

/**
 * Hook to sync thread titles from database with runtime threads
 */
export function useThreadTitles() {
  const threadList = useThreadList();
  const [titles, setTitles] = useState<ThreadTitles>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch titles from database
  const fetchTitles = useCallback(async () => {
    if (!threadList?.threads?.length) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/nexus/conversations');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
      }
      
      const data = await response.json();
      const newTitles: ThreadTitles = {};
      
      // Map conversation IDs to titles
      data.conversations?.forEach((conv: { id: string; title: string }) => {
        newTitles[conv.id] = conv.title;
      });
      
      setTitles(newTitles);
      log.info('Thread titles synced', { count: Object.keys(newTitles).length });
      
    } catch (error) {
      log.error('Failed to fetch thread titles', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      setIsLoading(false);
    }
  }, [threadList?.threads?.length]);
  
  // Sync titles when threads change
  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);
  
  // Get title for a specific thread
  const getThreadTitle = useCallback((threadId: string) => {
    return titles[threadId] || 'New Chat';
  }, [titles]);
  
  return {
    titles,
    isLoading,
    getThreadTitle,
    refreshTitles: fetchTitles
  };
}