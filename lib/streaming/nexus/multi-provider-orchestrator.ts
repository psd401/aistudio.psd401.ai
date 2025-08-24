import { createLogger, generateRequestId } from '@/lib/logger';
import { nexusProviderFactory } from './nexus-provider-factory';
import type { NexusModelCapabilities } from './nexus-provider-factory';

const log = createLogger({ module: 'multi-provider-orchestrator' });

export interface OrchestrationRequest {
  providers: string[];
  modelId: string;
  messages: any[];
  strategy: 'round_robin' | 'cost_optimized' | 'latency_optimized' | 'quality_optimized' | 'intelligent';
  options?: any;
  callbacks?: any;
  userId: string;
  conversationId?: string;
}

export interface OrchestrationResult {
  primaryResponse: any;
  providersUsed: string[];
  primaryProvider: string;
  fallbacksTriggered: string[];
  costBreakdown: {
    provider: string;
    cost: number;
    tokens: number;
    cacheHitRate?: number;
  }[];
  streamingLatency: number;
  providerSwitchTime?: number;
  capabilitiesUsed: {
    reasoning?: boolean;
    thinking?: boolean;
    artifacts?: boolean;
    webSearch?: boolean;
    codeExecution?: boolean;
    responsesAPI?: boolean;
  };
}

export class MultiProviderOrchestrator {
  private providerHealthCache = new Map<string, {
    isHealthy: boolean;
    lastCheck: number;
    averageLatency: number;
    successRate: number;
  }>();
  
  private fallbackChains = new Map<string, string[]>([
    ['openai', ['azure', 'google', 'amazon-bedrock']],
    ['google', ['openai', 'azure', 'amazon-bedrock']],
    ['amazon-bedrock', ['openai', 'google', 'azure']],
    ['azure', ['openai', 'google', 'amazon-bedrock']]
  ]);
  
  /**
   * Orchestrate multi-provider streaming
   */
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    
    log.info('Starting multi-provider orchestration', {
      requestId,
      providers: request.providers,
      strategy: request.strategy,
      messageCount: request.messages.length
    });
    
    try {
      // Determine execution strategy
      const executionPlan = await this.createExecutionPlan(request);
      
      // Execute based on strategy
      switch (request.strategy) {
        case 'round_robin':
          return await this.executeRoundRobin(request, executionPlan, requestId, startTime);
        case 'cost_optimized':
          return await this.executeCostOptimized(request, executionPlan, requestId, startTime);
        case 'latency_optimized':
          return await this.executeLatencyOptimized(request, executionPlan, requestId, startTime);
        case 'quality_optimized':
          return await this.executeQualityOptimized(request, executionPlan, requestId, startTime);
        case 'intelligent':
          return await this.executeIntelligent(request, executionPlan, requestId, startTime);
        default:
          throw new Error(`Unknown orchestration strategy: ${request.strategy}`);
      }
      
    } catch (error) {
      log.error('Multi-provider orchestration failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        providers: request.providers
      });
      throw error;
    }
  }
  
  /**
   * Create execution plan with provider capabilities and health
   */
  private async createExecutionPlan(request: OrchestrationRequest): Promise<{
    providers: {
      name: string;
      modelId: string;
      capabilities: NexusModelCapabilities;
      health: any;
      priority: number;
    }[];
  }> {
    const providers = await Promise.all(
      request.providers.map(async (provider, index) => {
        const capabilities = await nexusProviderFactory.getAvailableCapabilities(provider, request.modelId);
        const health = await this.checkProviderHealth(provider);
        
        return {
          name: provider,
          modelId: request.modelId,
          capabilities,
          health,
          priority: index
        };
      })
    );
    
    return { providers };
  }
  
  /**
   * Round robin execution - rotate through providers
   */
  private async executeRoundRobin(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number
  ): Promise<OrchestrationResult> {
    const primaryProvider = plan.providers[0];
    
    try {
      const response = await this.executeSingleProvider(primaryProvider, request);
      
      return {
        primaryResponse: response,
        providersUsed: [primaryProvider.name],
        primaryProvider: primaryProvider.name,
        fallbacksTriggered: [],
        costBreakdown: [{
          provider: primaryProvider.name,
          cost: this.estimateCost(primaryProvider, response),
          tokens: response.usage?.totalTokens || 0
        }],
        streamingLatency: Date.now() - startTime,
        capabilitiesUsed: this.extractCapabilitiesUsed(primaryProvider.capabilities)
      };
      
    } catch (error) {
      // Try next provider in round robin
      return await this.executeWithFallback(request, plan, requestId, startTime, [primaryProvider.name]);
    }
  }
  
  /**
   * Cost optimized execution - use cheapest provider first
   */
  private async executeCostOptimized(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number
  ): Promise<OrchestrationResult> {
    // Sort by cost per token
    const sortedProviders = plan.providers.sort(
      (a: any, b: any) => (a.capabilities.costPerToken || 0) - (b.capabilities.costPerToken || 0)
    );
    
    for (const provider of sortedProviders) {
      try {
        const response = await this.executeSingleProvider(provider, request);
        
        return {
          primaryResponse: response,
          providersUsed: [provider.name],
          primaryProvider: provider.name,
          fallbacksTriggered: [],
          costBreakdown: [{
            provider: provider.name,
            cost: this.estimateCost(provider, response),
            tokens: response.usage?.totalTokens || 0
          }],
          streamingLatency: Date.now() - startTime,
          capabilitiesUsed: this.extractCapabilitiesUsed(provider.capabilities)
        };
        
      } catch (error) {
        log.warn('Provider failed in cost optimization', {
          requestId,
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }
    
    throw new Error('All providers failed in cost optimization');
  }
  
  /**
   * Latency optimized execution - use fastest provider first
   */
  private async executeLatencyOptimized(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number
  ): Promise<OrchestrationResult> {
    // Sort by average latency
    const sortedProviders = plan.providers.sort(
      (a: any, b: any) => (a.capabilities.averageLatency || 1000) - (b.capabilities.averageLatency || 1000)
    );
    
    // Try the fastest provider first
    const primaryProvider = sortedProviders[0];
    
    try {
      const response = await this.executeSingleProvider(primaryProvider, request);
      
      return {
        primaryResponse: response,
        providersUsed: [primaryProvider.name],
        primaryProvider: primaryProvider.name,
        fallbacksTriggered: [],
        costBreakdown: [{
          provider: primaryProvider.name,
          cost: this.estimateCost(primaryProvider, response),
          tokens: response.usage?.totalTokens || 0
        }],
        streamingLatency: Date.now() - startTime,
        capabilitiesUsed: this.extractCapabilitiesUsed(primaryProvider.capabilities)
      };
      
    } catch (error) {
      return await this.executeWithFallback(request, plan, requestId, startTime, [primaryProvider.name]);
    }
  }
  
  /**
   * Quality optimized execution - use highest quality provider
   */
  private async executeQualityOptimized(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number
  ): Promise<OrchestrationResult> {
    // Calculate quality score for each provider
    const scoredProviders = plan.providers.map((provider: any) => ({
      ...provider,
      qualityScore: this.calculateQualityScore(provider.capabilities)
    })).sort((a: any, b: any) => b.qualityScore - a.qualityScore);
    
    const primaryProvider = scoredProviders[0];
    
    try {
      const response = await this.executeSingleProvider(primaryProvider, request);
      
      return {
        primaryResponse: response,
        providersUsed: [primaryProvider.name],
        primaryProvider: primaryProvider.name,
        fallbacksTriggered: [],
        costBreakdown: [{
          provider: primaryProvider.name,
          cost: this.estimateCost(primaryProvider, response),
          tokens: response.usage?.totalTokens || 0
        }],
        streamingLatency: Date.now() - startTime,
        capabilitiesUsed: this.extractCapabilitiesUsed(primaryProvider.capabilities)
      };
      
    } catch (error) {
      return await this.executeWithFallback(request, plan, requestId, startTime, [primaryProvider.name]);
    }
  }
  
  /**
   * Intelligent execution - use ML/heuristics to choose best provider
   */
  private async executeIntelligent(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number
  ): Promise<OrchestrationResult> {
    // Analyze request to determine best provider
    const requiredFeatures = this.analyzeRequestFeatures(request.messages);
    const userPreferences = await this.getUserPreferences(request.userId);
    
    // Score providers based on multiple factors
    const scoredProviders = plan.providers.map((provider: any) => ({
      ...provider,
      intelligenceScore: this.calculateIntelligenceScore(
        provider.capabilities,
        requiredFeatures,
        userPreferences,
        provider.health
      )
    })).sort((a: any, b: any) => b.intelligenceScore - a.intelligenceScore);
    
    const primaryProvider = scoredProviders[0];
    
    log.info('Intelligent provider selection', {
      requestId,
      selectedProvider: primaryProvider.name,
      score: primaryProvider.intelligenceScore,
      requiredFeatures,
      alternativeProviders: scoredProviders.slice(1).map((p: any) => ({
        name: p.name,
        score: p.intelligenceScore
      }))
    });
    
    try {
      const response = await this.executeSingleProvider(primaryProvider, request);
      
      return {
        primaryResponse: response,
        providersUsed: [primaryProvider.name],
        primaryProvider: primaryProvider.name,
        fallbacksTriggered: [],
        costBreakdown: [{
          provider: primaryProvider.name,
          cost: this.estimateCost(primaryProvider, response),
          tokens: response.usage?.totalTokens || 0
        }],
        streamingLatency: Date.now() - startTime,
        capabilitiesUsed: this.extractCapabilitiesUsed(primaryProvider.capabilities)
      };
      
    } catch (error) {
      return await this.executeWithFallback(request, plan, requestId, startTime, [primaryProvider.name]);
    }
  }
  
  /**
   * Execute with fallback providers
   */
  private async executeWithFallback(
    request: OrchestrationRequest,
    plan: any,
    requestId: string,
    startTime: number,
    failedProviders: string[]
  ): Promise<OrchestrationResult> {
    const remainingProviders = plan.providers.filter(
      (p: any) => !failedProviders.includes(p.name)
    );
    
    if (remainingProviders.length === 0) {
      throw new Error('All providers failed');
    }
    
    const fallbackProvider = remainingProviders[0];
    
    try {
      const response = await this.executeSingleProvider(fallbackProvider, request);
      
      return {
        primaryResponse: response,
        providersUsed: [...failedProviders, fallbackProvider.name],
        primaryProvider: fallbackProvider.name,
        fallbacksTriggered: failedProviders,
        costBreakdown: [{
          provider: fallbackProvider.name,
          cost: this.estimateCost(fallbackProvider, response),
          tokens: response.usage?.totalTokens || 0
        }],
        streamingLatency: Date.now() - startTime,
        capabilitiesUsed: this.extractCapabilitiesUsed(fallbackProvider.capabilities)
      };
      
    } catch (error) {
      return await this.executeWithFallback(
        request,
        plan,
        requestId,
        startTime,
        [...failedProviders, fallbackProvider.name]
      );
    }
  }
  
  /**
   * Execute single provider
   */
  private async executeSingleProvider(provider: any, request: OrchestrationRequest): Promise<any> {
    // Create model using Nexus factory
    const model = await nexusProviderFactory.createNexusModel(
      provider.name,
      provider.modelId,
      {
        conversationId: request.conversationId,
        enableCaching: true,
        enableOptimizations: true
      }
    );
    
    // Execute streaming (simplified for now)
    // In real implementation, this would use the actual AI SDK streaming
    return {
      text: 'Sample response from ' + provider.name,
      usage: {
        promptTokens: 100,
        completionTokens: 150,
        totalTokens: 250
      },
      finishReason: 'stop'
    };
  }
  
  // Helper methods
  
  private async checkProviderHealth(provider: string): Promise<any> {
    const cached = this.providerHealthCache.get(provider);
    const now = Date.now();
    
    if (cached && (now - cached.lastCheck) < 60000) { // 1 minute cache
      return cached;
    }
    
    // Simple health check (would be more sophisticated in reality)
    const health = {
      isHealthy: true,
      lastCheck: now,
      averageLatency: Math.random() * 1000 + 500, // 500-1500ms
      successRate: 0.95 + Math.random() * 0.05 // 95-100%
    };
    
    this.providerHealthCache.set(provider, health);
    return health;
  }
  
  private calculateQualityScore(capabilities: NexusModelCapabilities): number {
    let score = 50; // Base score
    
    if (capabilities.supportsReasoning) score += 25;
    if (capabilities.supportsThinking) score += 20;
    if (capabilities.artifacts) score += 10;
    if (capabilities.webSearch) score += 5;
    if (capabilities.codeExecution) score += 5;
    
    return score;
  }
  
  private analyzeRequestFeatures(messages: any[]): string[] {
    const features: string[] = [];
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    
    if (allText.includes('think') || allText.includes('reason')) {
      features.push('reasoning');
    }
    
    if (allText.includes('code') || allText.includes('program')) {
      features.push('code');
    }
    
    if (allText.includes('search') || allText.includes('web')) {
      features.push('web');
    }
    
    return features;
  }
  
  private async getUserPreferences(userId: string): Promise<any> {
    // Would query user preferences from database
    return {
      preferredProvider: 'openai',
      maxCostPerRequest: 0.10,
      qualityPreference: 'high'
    };
  }
  
  private calculateIntelligenceScore(
    capabilities: NexusModelCapabilities,
    requiredFeatures: string[],
    userPreferences: any,
    health: any
  ): number {
    let score = 0;
    
    // Feature matching (40% of score)
    for (const feature of requiredFeatures) {
      if (feature === 'reasoning' && capabilities.supportsReasoning) score += 20;
      if (feature === 'code' && capabilities.codeExecution) score += 15;
      if (feature === 'web' && capabilities.webSearch) score += 10;
    }
    
    // Cost factor (20% of score)
    const costScore = Math.max(0, 20 - (capabilities.costPerToken || 0) * 100000);
    score += costScore;
    
    // Performance factor (20% of score)
    const latencyScore = Math.max(0, 20 - (capabilities.averageLatency || 1000) / 50);
    score += latencyScore;
    
    // Health factor (20% of score)
    const healthScore = (health.successRate || 0.9) * 20;
    score += healthScore;
    
    return Math.min(100, score);
  }
  
  private estimateCost(provider: any, response: any): number {
    const tokens = response.usage?.totalTokens || 0;
    return tokens * (provider.capabilities.costPerToken || 0);
  }
  
  private extractCapabilitiesUsed(capabilities: NexusModelCapabilities): any {
    return {
      reasoning: capabilities.supportsReasoning,
      thinking: capabilities.supportsThinking,
      artifacts: capabilities.artifacts,
      webSearch: capabilities.webSearch,
      codeExecution: capabilities.codeExecution,
      responsesAPI: capabilities.responsesAPI
    };
  }
}