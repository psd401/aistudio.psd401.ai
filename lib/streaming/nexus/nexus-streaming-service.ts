import { UnifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import { nexusProviderFactory, type NexusModelCapabilities } from './nexus-provider-factory';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import type { StreamRequest, StreamResponse, StreamingProgress } from '@/lib/streaming/types';
import { ConversationStateManager } from './conversation-state-manager';
import { MultiProviderOrchestrator } from './multi-provider-orchestrator';
import { ResponseCacheService } from './response-cache-service';
import { CostOptimizer } from './cost-optimizer';

const log = createLogger({ module: 'nexus-streaming-service' });

// Interface for onFinish callback data
interface FinishData {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    totalCost?: number;
  };
  finishReason?: string;
}

export interface NexusOptions {
  enableCaching?: boolean;
  enableOptimizations?: boolean;
  useResponsesAPI?: boolean;
  enablePromptCache?: boolean;
  enableContextCache?: boolean;
  costBudget?: number;
  qualityThreshold?: number;
}

export interface NexusStreamRequest extends StreamRequest {
  // Multi-provider support
  providers?: string[];
  routingStrategy?: 'round_robin' | 'cost_optimized' | 'latency_optimized' | 'quality_optimized' | 'intelligent';
  fallbackChain?: string[];
  
  // Nexus-specific options
  nexusOptions?: NexusOptions;
  
  // Enhanced telemetry
  trackCosts?: boolean;
  trackPerformance?: boolean;
  recordProviderMetrics?: boolean;
}

export interface NexusStreamResponse extends StreamResponse {
  // Multi-provider metadata
  providersUsed?: string[];
  primaryProvider?: string;
  fallbacksTriggered?: string[];
  
  // Cost and performance metrics
  costBreakdown?: {
    provider: string;
    cost: number;
    tokens: number;
    cacheHitRate?: number;
  }[];
  
  performanceMetrics?: {
    totalLatency: number;
    streamingLatency: number;
    providerSwitchTime?: number;
    cacheTime?: number;
  };
  
  // Nexus-specific data
  cacheMetadata?: {
    cacheHit: boolean;
    cacheKey?: string;
    tokensSaved?: number;
    costSaved?: number;
  };
  
  // Enhanced capabilities used
  capabilitiesUsed?: {
    reasoning?: boolean;
    thinking?: boolean;
    artifacts?: boolean;
    webSearch?: boolean;
    codeExecution?: boolean;
    responsesAPI?: boolean;
  };
}

/**
 * Enhanced streaming service that extends UnifiedStreamingService
 * with multi-provider orchestration, advanced caching, and cost optimization
 */
export class NexusStreamingService extends UnifiedStreamingService {
  private multiProviderOrchestrator: MultiProviderOrchestrator;
  private conversationStateManager: ConversationStateManager;
  private responseCacheService: ResponseCacheService;
  private costOptimizer: CostOptimizer;
  
  constructor() {
    super();
    this.multiProviderOrchestrator = new MultiProviderOrchestrator();
    this.conversationStateManager = new ConversationStateManager();
    this.responseCacheService = new ResponseCacheService();
    this.costOptimizer = new CostOptimizer();
  }
  
  /**
   * Enhanced streaming with multi-provider orchestration and Nexus features
   */
  async streamNexus(request: NexusStreamRequest): Promise<NexusStreamResponse> {
    const requestId = generateRequestId();
    const timer = startTimer('nexus-streaming-service.streamNexus');
    const startTime = Date.now();
    
    log.info('Starting Nexus stream', {
      requestId,
      provider: request.provider,
      providers: request.providers,
      modelId: request.modelId,
      source: request.source,
      userId: request.userId,
      conversationId: request.conversationId ? String(request.conversationId) : undefined,
      messageCount: request.messages.length,
      routingStrategy: request.routingStrategy,
      nexusOptions: sanitizeForLogging(request.nexusOptions)
    });
    
    try {
      // Check if this is a multi-provider request
      if (request.providers && request.providers.length > 1) {
        return await this.streamMultiProvider(request, requestId, timer, startTime);
      }
      
      // Single provider with Nexus enhancements
      return await this.streamSingleProviderEnhanced(request, requestId, timer, startTime);
      
    } catch (error) {
      timer({ status: 'error' });
      log.error('Nexus stream failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        provider: request.provider,
        providers: request.providers,
        modelId: request.modelId
      });
      throw error;
    }
  }
  
  /**
   * Multi-provider orchestration
   */
  private async streamMultiProvider(
    request: NexusStreamRequest,
    requestId: string,
    timer: (metadata?: Record<string, unknown>) => void,
    startTime: number
  ): Promise<NexusStreamResponse> {
    log.info('Executing multi-provider stream', {
      requestId,
      providers: request.providers,
      routingStrategy: request.routingStrategy
    });
    
    // Determine routing strategy
    const strategy = request.routingStrategy || 'intelligent';
    const providers = request.providers || [request.provider];
    
    // Execute orchestration
    const orchestrationResult = await this.multiProviderOrchestrator.orchestrate({
      providers,
      modelId: request.modelId,
      messages: request.messages,
      strategy,
      options: request.nexusOptions,
      callbacks: request.callbacks,
      userId: request.userId,
      conversationId: request.conversationId ? String(request.conversationId) : undefined
    });
    
    // Process results
    const endTime = Date.now();
    const response: NexusStreamResponse = {
      ...orchestrationResult.primaryResponse,
      requestId,
      providersUsed: orchestrationResult.providersUsed,
      primaryProvider: orchestrationResult.primaryProvider,
      fallbacksTriggered: orchestrationResult.fallbacksTriggered,
      costBreakdown: orchestrationResult.costBreakdown,
      performanceMetrics: {
        totalLatency: endTime - startTime,
        streamingLatency: orchestrationResult.streamingLatency,
        providerSwitchTime: orchestrationResult.providerSwitchTime
      },
      capabilitiesUsed: orchestrationResult.capabilitiesUsed
    };
    
    timer({ 
      status: 'success', 
      providersUsed: orchestrationResult.providersUsed.length,
      primaryProvider: orchestrationResult.primaryProvider
    });
    
    log.info('Multi-provider stream completed', {
      requestId,
      providersUsed: orchestrationResult.providersUsed,
      primaryProvider: orchestrationResult.primaryProvider,
      totalLatency: response.performanceMetrics?.totalLatency
    });
    
    return response;
  }
  
  /**
   * Enhanced single provider streaming with Nexus features
   */
  private async streamSingleProviderEnhanced(
    request: NexusStreamRequest,
    requestId: string,
    timer: (metadata?: Record<string, unknown>) => void,
    startTime: number
  ): Promise<NexusStreamResponse> {
    log.info('Executing enhanced single provider stream', {
      requestId,
      provider: request.provider,
      modelId: request.modelId,
      nexusOptions: request.nexusOptions
    });
    
    // Check cache first
    let cacheResult = null;
    if (request.nexusOptions?.enableCaching !== false) {
      cacheResult = await this.responseCacheService.checkCache({
        provider: request.provider,
        modelId: request.modelId,
        messages: request.messages,
        conversationId: request.conversationId ? String(request.conversationId) : undefined,
        userId: request.userId
      });
      
      if (cacheResult?.hit) {
        log.info('Cache hit found', {
          requestId,
          cacheKey: cacheResult.key,
          tokensSaved: cacheResult.tokensSaved
        });
        
        // Return cached response
        return this.buildCachedResponse(cacheResult, requestId, timer, startTime);
      }
    }
    
    // Get enhanced model
    const nexusModel = await nexusProviderFactory.createNexusModel(
      request.provider,
      request.modelId,
      {
        conversationId: request.conversationId ? String(request.conversationId) : undefined,
        enableCaching: request.nexusOptions?.enableCaching,
        enableOptimizations: request.nexusOptions?.enableOptimizations,
        useResponsesAPI: request.nexusOptions?.useResponsesAPI,
        enablePromptCache: request.nexusOptions?.enablePromptCache,
        enableContextCache: request.nexusOptions?.enableContextCache,
        reasoningEffort: request.options?.reasoningEffort,
        responseMode: request.options?.responseMode,
        backgroundMode: request.options?.backgroundMode,
        thinkingBudget: request.options?.thinkingBudget
      }
    );
    
    // Enhance the base stream request
    const enhancedRequest: StreamRequest = {
      ...request,
      provider: request.provider,
      modelId: request.modelId,
      callbacks: {
        ...request.callbacks,
        onProgress: (progress) => {
          this.handleEnhancedProgress(progress, requestId, request);
          request.callbacks?.onProgress?.(progress);
        },
        onFinish: async (data) => {
          await this.handleEnhancedFinish(data, request, nexusModel.capabilities, requestId);
          await request.callbacks?.onFinish?.(data);
        }
      }
    };
    
    // Execute base streaming with enhancements
    const baseResponse = await super.stream(enhancedRequest);
    
    // Calculate costs and metrics
    const endTime = Date.now();
    const usage = await baseResponse.result.usage;
    const costEstimate = nexusModel.estimateCost?.(
      usage?.totalTokens || 0
    ) || 0;
    
    // Cache the response if enabled
    if (request.nexusOptions?.enableCaching !== false && !cacheResult?.hit) {
      await this.responseCacheService.cacheResponse({
        provider: request.provider,
        modelId: request.modelId,
        messages: request.messages,
        response: baseResponse.result,
        conversationId: request.conversationId ? String(request.conversationId) : undefined,
        userId: request.userId,
        cost: costEstimate
      });
    }
    
    // Build enhanced response
    const response: NexusStreamResponse = {
      ...baseResponse,
      requestId,
      providersUsed: [request.provider],
      primaryProvider: request.provider,
      costBreakdown: [{
        provider: request.provider,
        cost: costEstimate,
        tokens: usage?.totalTokens || 0,
        cacheHitRate: 0 // No cache hit for this request
      }],
      performanceMetrics: {
        totalLatency: endTime - startTime,
        streamingLatency: endTime - startTime,
        cacheTime: cacheResult ? 50 : 0 // Estimated cache check time
      },
      cacheMetadata: {
        cacheHit: false,
        cacheKey: undefined,
        tokensSaved: 0,
        costSaved: 0
      },
      capabilitiesUsed: {
        reasoning: nexusModel.capabilities.supportsReasoning,
        thinking: nexusModel.capabilities.supportsThinking,
        artifacts: nexusModel.capabilities.artifacts,
        webSearch: nexusModel.capabilities.webSearch,
        codeExecution: nexusModel.capabilities.codeExecution,
        responsesAPI: nexusModel.capabilities.responsesAPI
      }
    };
    
    timer({ 
      status: 'success',
      provider: request.provider,
      tokensUsed: usage?.totalTokens || 0,
      cost: costEstimate
    });
    
    log.info('Enhanced single provider stream completed', {
      requestId,
      provider: request.provider,
      totalLatency: response.performanceMetrics?.totalLatency,
      cost: costEstimate,
      capabilitiesUsed: response.capabilitiesUsed
    });
    
    return response;
  }
  
  /**
   * Handle enhanced progress events with cost tracking
   */
  private handleEnhancedProgress(
    event: StreamingProgress,
    requestId: string,
    request: NexusStreamRequest
  ) {
    if (request.trackPerformance) {
      // Track streaming performance metrics
      log.debug('Enhanced progress tracking', {
        requestId,
        tokens: event.metadata?.tokens,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Handle enhanced finish with state management and metrics
   */
  private async handleEnhancedFinish(
    data: FinishData,
    request: NexusStreamRequest,
    capabilities: NexusModelCapabilities,
    requestId: string
  ) {
    // Save conversation state
    if (request.conversationId) {
      await this.conversationStateManager.updateConversation({
        conversationId: String(request.conversationId),
        provider: request.provider,
        modelId: request.modelId,
        usage: data.usage,
        capabilities,
        requestId
      });
    }
    
    // Record cost metrics if enabled
    if (request.trackCosts && data.usage) {
      const cost = (capabilities.costPerToken || 0) * data.usage.totalTokens;
      await this.recordCostMetrics({
        userId: request.userId,
        conversationId: request.conversationId ? String(request.conversationId) : undefined,
        provider: request.provider,
        modelId: request.modelId,
        tokens: data.usage.totalTokens,
        cost,
        requestId
      });
    }
    
    // Update provider metrics if enabled
    if (request.recordProviderMetrics) {
      await this.recordProviderMetrics({
        provider: request.provider,
        modelId: request.modelId,
        responseTime: Date.now(),
        success: true,
        capabilities,
        requestId
      });
    }
  }
  
  /**
   * Build response from cache hit
   */
  private buildCachedResponse(
    cacheResult: {
      response: { text: string; usage?: { totalTokens: number } };
      key: string;
      tokensSaved: number;
      costSaved: number;
      provider: string;
      capabilities?: Record<string, unknown>;
    },
    requestId: string,
    timer: (metadata?: Record<string, unknown>) => void,
    startTime: number
  ): NexusStreamResponse {
    const endTime = Date.now();
    
    timer({
      status: 'success',
      cacheHit: true,
      tokensSaved: cacheResult.tokensSaved
    });
    
    return {
      result: cacheResult.response,
      requestId: requestId as string,
      capabilities: cacheResult.capabilities,
      telemetryConfig: { 
        isEnabled: false,
        functionId: '',
        metadata: {},
        recordInputs: false,
        recordOutputs: false,
        tracer: undefined
      },
      providersUsed: [cacheResult.provider],
      primaryProvider: cacheResult.provider,
      performanceMetrics: {
        totalLatency: endTime - startTime,
        streamingLatency: 0, // No streaming for cache hit
        cacheTime: endTime - startTime
      },
      cacheMetadata: {
        cacheHit: true,
        cacheKey: cacheResult.key,
        tokensSaved: cacheResult.tokensSaved,
        costSaved: cacheResult.costSaved
      }
    };
  }
  
  /**
   * Record cost metrics to database
   */
  private async recordCostMetrics(data: {
    userId: string;
    conversationId?: string;
    provider: string;
    modelId: string;
    tokens: number;
    cost: number;
    requestId: string;
  }) {
    try {
      // This would insert into nexus_provider_metrics table
      log.debug('Recording cost metrics', { 
        requestId: data.requestId,
        cost: data.cost,
        tokens: data.tokens
      });
    } catch (error) {
      log.error('Failed to record cost metrics', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Record provider performance metrics
   */
  private async recordProviderMetrics(data: {
    provider: string;
    modelId: string;
    responseTime: number;
    success: boolean;
    capabilities: NexusModelCapabilities;
    requestId: string;
  }) {
    try {
      // This would update provider performance tracking
      log.debug('Recording provider metrics', { 
        requestId: data.requestId,
        provider: data.provider,
        success: data.success
      });
    } catch (error) {
      log.error('Failed to record provider metrics', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get optimal provider recommendation for request
   */
  async getProviderRecommendation(
    request: Partial<NexusStreamRequest>
  ): Promise<{ provider: string; modelId: string; reasoning: string }> {
    const requirements = {
      priority: request.nexusOptions?.costBudget ? 'cost' as const : 'quality' as const,
      features: this.extractRequiredFeatures(request.messages || []),
      maxCost: request.nexusOptions?.costBudget,
      maxLatency: 5000 // 5 seconds default
    };
    
    const recommendations = await nexusProviderFactory.recommendProvider(requirements);
    
    if (recommendations.length === 0) {
      return {
        provider: 'openai',
        modelId: 'gpt-4o',
        reasoning: 'Default fallback to OpenAI GPT-4o'
      };
    }
    
    const best = recommendations[0];
    return {
      provider: best.provider,
      modelId: best.modelId,
      reasoning: `Selected based on ${requirements.priority} optimization (score: ${best.score})`
    };
  }
  
  /**
   * Extract required features from messages
   */
  private extractRequiredFeatures(messages: Array<{ content: string | Record<string, unknown> }>): string[] {
    const features: string[] = [];
    const allText = messages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join(' ')
      .toLowerCase();
    
    if (allText.includes('think') || allText.includes('reason')) {
      features.push('reasoning', 'thinking');
    }
    
    if (allText.includes('code') || allText.includes('program')) {
      features.push('code');
    }
    
    if (allText.includes('search') || allText.includes('web') || allText.includes('internet')) {
      features.push('web');
    }
    
    if (allText.includes('create') || allText.includes('generate') || allText.includes('build')) {
      features.push('artifacts');
    }
    
    return features;
  }
}

// Export singleton instance
export const nexusStreamingService = new NexusStreamingService();