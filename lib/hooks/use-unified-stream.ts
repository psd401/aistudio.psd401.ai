"use client";

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { createLogger } from '@/lib/logger';
import type { 
  UseUnifiedStreamConfig, 
  UseUnifiedStreamReturn,
  ProviderCapabilities,
  StreamRequest
} from '@/lib/streaming/types';

const log = createLogger({ module: 'use-unified-stream' });

/**
 * Unified streaming hook that provides a consistent interface
 * for all AI streaming operations across the application
 * 
 * Features:
 * - Automatic provider detection and capabilities
 * - Reasoning and thinking content extraction
 * - Adaptive timeouts based on model capabilities
 * - Comprehensive error handling
 * - Progress tracking and status updates
 */
export function useUnifiedStream(config: UseUnifiedStreamConfig): UseUnifiedStreamReturn {
  const { toast } = useToast();
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  
  // Use AI SDK's useChat with unified streaming endpoint
  const {
    messages,
    setMessages,
    status,
    error: chatError,
    sendMessage: baseSendMessage,
    stop
  } = useChat({
    onFinish: (message) => {
      log.debug('Stream finished', {
        source: config.source,
        messageLength: 0
      });
      
      // Extract reasoning content if available
      if ('reasoning' in message && typeof message.reasoning === 'string') {
        setReasoning(message.reasoning);
      }
      
      // Extract thinking content if available
      if ('thinking' in message && typeof message.thinking === 'string') {
        setThinking(message.thinking);
      }
      
      toast({
        title: 'Response Complete',
        description: 'AI response generated successfully'
      });
    },
    onError: (error) => {
      log.error('Stream error', {
        source: config.source,
        error: error.message
      });
      
      // Show user-friendly error messages
      let errorTitle = 'AI Error';
      let errorDescription = error.message;
      
      if (error.message.includes('timeout')) {
        errorTitle = 'Request Timeout';
        errorDescription = 'The AI model took too long to respond. Please try again.';
      } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
        errorTitle = 'Rate Limit Exceeded';
        errorDescription = 'Too many requests. Please wait a moment before trying again.';
      } else if (error.message.includes('content')) {
        errorTitle = 'Content Policy';
        errorDescription = 'The request was blocked by content policy filters.';
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: 'destructive'
      });
    }
  });
  
  /**
   * Enhanced send message function with unified streaming support
   */
  const sendMessage = useCallback(async (
    message: Parameters<typeof baseSendMessage>[0],
    requestConfig?: Partial<StreamRequest>
  ) => {
    try {
      log.debug('Sending message via unified stream', {
        source: config.source,
        modelId: config.modelId,
        provider: config.provider,
        hasConfig: !!requestConfig
      });
      
      // Clear previous reasoning/thinking content
      setReasoning(null);
      setThinking(null);
      
      // Build request body with unified streaming configuration
      const body = {
        // Core configuration
        source: config.source,
        modelId: config.modelId || requestConfig?.modelId,
        provider: config.provider || requestConfig?.provider,
        
        // System prompt and model configuration
        systemPrompt: config.systemPrompt || requestConfig?.systemPrompt,
        maxTokens: requestConfig?.maxTokens,
        temperature: requestConfig?.temperature,
        timeout: requestConfig?.timeout,
        
        // Advanced model options
        reasoningEffort: config.options?.reasoningEffort || 'medium',
        responseMode: config.options?.responseMode || 'standard',
        backgroundMode: config.options?.backgroundMode || false,
        thinkingBudget: config.options?.thinkingBudget,
        enableWebSearch: config.options?.enableWebSearch || false,
        enableCodeInterpreter: config.options?.enableCodeInterpreter || false,
        enableImageGeneration: config.options?.enableImageGeneration || false,
        
        // Context from request config
        conversationId: requestConfig?.conversationId,
        executionId: requestConfig?.executionId,
        documentId: requestConfig?.documentId,
        
        // Telemetry configuration
        recordInputs: config.telemetry?.recordInputs,
        recordOutputs: config.telemetry?.recordOutputs,
        
        // Add any additional fields from request config
        ...requestConfig
      };
      
      // Validate required fields
      if (!body.modelId) {
        throw new Error('Model ID is required for unified streaming');
      }
      
      if (!body.provider) {
        throw new Error('Provider is required for unified streaming');
      }
      
      await baseSendMessage(message, { body });
      
    } catch (error) {
      log.error('Failed to send message', {
        source: config.source,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }, [config, baseSendMessage]);
  
  /**
   * Clear all messages and state
   */
  const clear = useCallback(() => {
    setMessages([]);
    setReasoning(null);
    setThinking(null);
    setCapabilities(null);
  }, [setMessages]);
  
  /**
   * Fetch model capabilities when config changes
   */
  useEffect(() => {
    async function fetchCapabilities() {
      if (!config.modelId || !config.provider) {
        return;
      }
      
      try {
        const response = await fetch('/api/models/capabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: config.provider,
            modelId: config.modelId
          })
        });
        
        if (response.ok) {
          const caps = await response.json();
          setCapabilities(caps);
          
          log.debug('Model capabilities loaded', {
            modelId: config.modelId,
            provider: config.provider,
            supportsReasoning: caps.supportsReasoning,
            supportsThinking: caps.supportsThinking
          });
        }
      } catch (error) {
        log.warn('Failed to fetch model capabilities', {
          modelId: config.modelId,
          provider: config.provider,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    fetchCapabilities();
  }, [config.modelId, config.provider]);
  
  return {
    messages,
    status: status as UseUnifiedStreamReturn['status'],
    error: chatError || null,
    reasoning,
    thinking,
    sendMessage,
    stop,
    clear,
    capabilities
  };
}

/**
 * Hook for chat-specific streaming with sensible defaults
 */
export function useChatStream(config?: Partial<UseUnifiedStreamConfig>) {
  return useUnifiedStream({
    source: 'chat',
    ...config
  });
}

/**
 * Hook for model comparison streaming
 */
export function useCompareStream(config: {
  model1?: { provider: string; modelId: string };
  model2?: { provider: string; modelId: string };
} & Partial<UseUnifiedStreamConfig>) {
  // For comparison, we'll manage two separate streams
  const stream1 = useUnifiedStream({
    source: 'compare',
    provider: config.model1?.provider,
    modelId: config.model1?.modelId,
    ...config
  });
  
  const stream2 = useUnifiedStream({
    source: 'compare',
    provider: config.model2?.provider,
    modelId: config.model2?.modelId,
    ...config
  });
  
  return { stream1, stream2 };
}

/**
 * Hook for assistant execution streaming
 */
export function useAssistantStream(config: {
  executionId?: number;
} & Partial<UseUnifiedStreamConfig>) {
  return useUnifiedStream({
    source: 'assistant_execution',
    ...config
  });
}