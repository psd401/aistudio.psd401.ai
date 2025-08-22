import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import type { StreamRequest } from '@/lib/streaming/types';

// Allow streaming responses up to 10 minutes for reasoning models
export const maxDuration = 600;

/**
 * Unified streaming API route that handles all AI streaming operations
 * Supports chat, model comparison, and assistant execution
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.streaming');
  const log = createLogger({ requestId, route: 'api.streaming' });
  
  log.info('POST /api/streaming - Processing unified streaming request');
  
  try {
    // 1. Parse and validate request
    const body = await req.json();
    
    log.debug('Request body received', {
      bodyKeys: Object.keys(body),
      source: body.source,
      provider: body.provider,
      modelId: body.modelId,
      messageCount: body.messages?.length || 0
    });
    
    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      throw ErrorFactories.validationFailed([
        { field: 'messages', message: 'Messages array is required' }
      ]);
    }
    
    if (!body.modelId) {
      throw ErrorFactories.validationFailed([
        { field: 'modelId', message: 'Model ID is required' }
      ]);
    }
    
    if (!body.provider) {
      throw ErrorFactories.validationFailed([
        { field: 'provider', message: 'Provider is required' }
      ]);
    }
    
    if (!body.source || !['chat', 'compare', 'assistant_execution'].includes(body.source)) {
      throw ErrorFactories.validationFailed([
        { field: 'source', message: 'Valid source is required (chat, compare, assistant_execution)' }
      ]);
    }
    
    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    log.debug('User authenticated', { userId: session.sub });
    
    // 3. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 4. Build streaming request
    const streamRequest: StreamRequest = {
      // Core request data
      messages: body.messages,
      modelId: body.modelId,
      provider: body.provider,
      
      // User context
      userId: currentUser.data.user.id.toString(),
      sessionId: session.sub,
      conversationId: body.conversationId,
      
      // Request source and metadata
      source: body.source,
      executionId: body.executionId,
      documentId: body.documentId,
      
      // Model configuration
      systemPrompt: body.systemPrompt,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      timeout: body.timeout,
      
      // Advanced model options
      options: {
        reasoningEffort: body.reasoningEffort || 'medium',
        responseMode: body.responseMode || 'standard',
        backgroundMode: body.backgroundMode || false,
        thinkingBudget: body.thinkingBudget,
        enableWebSearch: body.enableWebSearch || false,
        enableCodeInterpreter: body.enableCodeInterpreter || false,
        enableImageGeneration: body.enableImageGeneration || false
      },
      
      // Telemetry configuration
      telemetry: {
        recordInputs: body.recordInputs,
        recordOutputs: body.recordOutputs,
        customAttributes: {
          'request.id': requestId,
          'request.source': body.source,
          'request.timestamp': Date.now()
        }
      }
    };
    
    log.info('Streaming request prepared', {
      source: streamRequest.source,
      provider: streamRequest.provider,
      modelId: streamRequest.modelId,
      userId: streamRequest.userId,
      hasSystemPrompt: !!streamRequest.systemPrompt,
      hasOptions: !!streamRequest.options
    });
    
    // 5. Process streaming request
    const streamResponse = await unifiedStreamingService.stream(streamRequest);
    
    log.info('Stream initiated successfully', {
      requestId: streamResponse.requestId,
      supportsReasoning: streamResponse.capabilities.supportsReasoning,
      supportsThinking: streamResponse.capabilities.supportsThinking,
      maxTimeout: streamResponse.capabilities.maxTimeoutMs
    });
    
    // 6. Return streaming response with proper headers
    const response = streamResponse.result.toUIMessageStreamResponse({
      headers: {
        'X-Request-Id': requestId,
        'X-Source': body.source,
        'X-Provider': body.provider,
        'X-Model-Id': body.modelId,
        'X-Supports-Reasoning': streamResponse.capabilities.supportsReasoning.toString(),
        'X-Supports-Thinking': streamResponse.capabilities.supportsThinking.toString(),
        'X-Max-Timeout': streamResponse.capabilities.maxTimeoutMs.toString(),
        // CORS headers for browser clients
        'Access-Control-Expose-Headers': 'X-Request-Id,X-Source,X-Provider,X-Model-Id,X-Supports-Reasoning,X-Supports-Thinking,X-Max-Timeout'
      }
    });
    
    timer({ 
      status: 'success',
      source: body.source,
      provider: body.provider,
      modelId: body.modelId
    });
    
    return response;
    
  } catch (error) {
    log.error('Streaming API error', {
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    // Return appropriate error response based on error type
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Authentication required',
          requestId
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId
          }
        }
      );
    }
    
    if (error instanceof Error && error.message.includes('validation')) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: error.message,
          requestId
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId
          }
        }
      );
    }
    
    if (error instanceof Error && error.message.includes('Provider') && error.message.includes('unavailable')) {
      return new Response(
        JSON.stringify({
          error: 'Provider Unavailable',
          message: error.message,
          requestId
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
            'Retry-After': '60' // Suggest retry after 1 minute
          }
        }
      );
    }
    
    // Default server error
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during streaming',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        }
      }
    );
  }
}

/**
 * Handle OPTIONS request for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400' // 24 hours
    }
  });
}