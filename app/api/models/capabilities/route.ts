import { getModelCapabilities } from '@/app/api/chat/lib/provider-factory';
import { createLogger, generateRequestId } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';

export const runtime = 'nodejs';

/**
 * API endpoint to get model capabilities
 * Used by frontend to understand model features and configure UI accordingly
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const log = createLogger({ requestId, route: 'api.models.capabilities' });
  
  log.info('POST /api/models/capabilities - Getting model capabilities');
  
  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.provider) {
      throw ErrorFactories.validationFailed([
        { field: 'provider', message: 'Provider is required' }
      ]);
    }
    
    if (!body.modelId) {
      throw ErrorFactories.validationFailed([
        { field: 'modelId', message: 'Model ID is required' }
      ]);
    }
    
    log.debug('Getting capabilities', {
      provider: body.provider,
      modelId: body.modelId
    });
    
    // Get model capabilities
    const capabilities = await getModelCapabilities(body.provider, body.modelId);
    
    log.info('Capabilities retrieved successfully', {
      provider: body.provider,
      modelId: body.modelId,
      supportsReasoning: capabilities.supportsReasoning,
      supportsThinking: capabilities.supportsThinking,
      maxTimeoutMs: capabilities.maxTimeoutMs
    });
    
    return Response.json(capabilities, {
      headers: {
        'X-Request-Id': requestId,
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
    
  } catch (error) {
    log.error('Failed to get model capabilities', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    if (error instanceof Error && error.message.includes('validation')) {
      return Response.json(
        {
          error: 'Validation Error',
          message: error.message,
          requestId
        },
        {
          status: 400,
          headers: { 'X-Request-Id': requestId }
        }
      );
    }
    
    return Response.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to get model capabilities',
        requestId
      },
      {
        status: 500,
        headers: { 'X-Request-Id': requestId }
      }
    );
  }
}