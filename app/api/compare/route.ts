import { z } from 'zod';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { jobManagementService } from '@/lib/streaming/job-management-service';
import type { CreateJobRequest } from '@/lib/streaming/job-management-service';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ErrorFactories } from '@/lib/error-utils';
import { getStreamingJobsQueueUrl } from '@/lib/aws/queue-config';
import { hasToolAccess } from '@/utils/roles';
import type { UIMessage } from 'ai';

// Allow processing up to 30 seconds
export const maxDuration = 30;

// SQS client for sending jobs to worker queue
const sqsClient = new SQSClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
});

// Input validation schema for compare requests
const CompareRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(10000, 'Prompt too long'),
  model1Id: z.string().min(1, 'Model 1 ID is required'),
  model2Id: z.string().min(1, 'Model 2 ID is required'),
  model1Name: z.string().optional(),
  model2Name: z.string().optional()
});

/**
 * Compare Models API - Two-Job Approach
 * Creates two separate jobs for model comparison using existing Lambda infrastructure
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.compare');
  const log = createLogger({ requestId, route: 'api.compare' });
  
  log.info('POST /api/compare - Processing model comparison request');
  
  try {
    // 1. Parse and validate request
    const body = await req.json();
    
    const validationResult = CompareRequestSchema.safeParse(body);
    if (!validationResult.success) {
      log.warn('Invalid request format', { 
        errors: validationResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request format', 
          details: validationResult.error.issues,
          requestId 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const { prompt, model1Id, model2Id, model1Name, model2Name } = validationResult.data;
    
    log.info('Request parsed', sanitizeForLogging({
      promptLength: prompt.length,
      model1Id,
      model2Id,
      hasModel1Name: !!model1Name,
      hasModel2Name: !!model2Name
    }));
    
    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 3. Check tool access
    const hasAccess = await hasToolAccess("model-compare");
    if (!hasAccess) {
      log.warn('Model compare access denied', { userId: session.sub });
      timer({ status: 'error', reason: 'access_denied' });
      return new Response('Access denied', { status: 403 });
    }
    
    // 4. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = currentUser.data.user.id;
    
    // 5. Validate both models exist and are active
    const modelsResult = await executeSQL(
      `SELECT id, provider, model_id, name, chat_enabled
       FROM ai_models 
       WHERE model_id IN (:model1Id, :model2Id) 
       AND active = true`,
      [
        { name: 'model1Id', value: { stringValue: model1Id } },
        { name: 'model2Id', value: { stringValue: model2Id } }
      ]
    );
    
    if (modelsResult.length !== 2) {
      log.error('One or both models not found', { 
        model1Id, 
        model2Id,
        foundCount: modelsResult.length 
      });
      return new Response(
        JSON.stringify({ error: 'One or both selected models not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const model1Config = modelsResult.find(m => m.model_id === model1Id);
    const model2Config = modelsResult.find(m => m.model_id === model2Id);
    
    if (!model1Config || !model2Config) {
      log.error('Model configuration mismatch');
      return new Response(
        JSON.stringify({ error: 'Model configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if models are enabled for chat
    if (!model1Config.chat_enabled || !model2Config.chat_enabled) {
      log.error('One or both models not enabled for chat', { 
        model1Enabled: model1Config.chat_enabled,
        model2Enabled: model2Config.chat_enabled
      });
      return new Response(
        JSON.stringify({ error: 'One or both models not enabled for chat' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    log.info('Both models validated', sanitizeForLogging({
      model1: { provider: String(model1Config.provider), modelId: String(model1Config.model_id) },
      model2: { provider: String(model2Config.provider), modelId: String(model2Config.model_id) }
    }));
    
    // 6. Create comparison record for tracking
    const comparisonResult = await executeSQL(
      `INSERT INTO model_comparisons (
        user_id, prompt, model1_id, model2_id, model1_name, model2_name,
        metadata, created_at, updated_at
      ) VALUES (
        :userId, :prompt, :model1Id, :model2Id, :model1Name, :model2Name,
        :metadata::jsonb, NOW(), NOW()
      ) RETURNING id`,
      [
        { name: 'userId', value: { longValue: userId } },
        { name: 'prompt', value: { stringValue: prompt } },
        { name: 'model1Id', value: { longValue: Number(model1Config.id) } },
        { name: 'model2Id', value: { longValue: Number(model2Config.id) } },
        { name: 'model1Name', value: { stringValue: model1Name || String(model1Config.name) } },
        { name: 'model2Name', value: { stringValue: model2Name || String(model2Config.name) } },
        { name: 'metadata', value: { stringValue: JSON.stringify({ 
          source: 'compare',
          requestId,
          sessionId: session.sub
        }) } }
      ]
    );
    
    const comparisonId = Number(comparisonResult[0].id);
    
    log.info('Comparison record created', sanitizeForLogging({ comparisonId }));
    
    // 7. Create messages array for jobs
    const messages: UIMessage[] = [
      {
        id: generateRequestId(),
        role: 'user',
        parts: [{ type: 'text', text: prompt }]
      }
    ];
    
    // 8. Create two separate jobs
    const job1Request: CreateJobRequest = {
      conversationId: comparisonId.toString(), // Use comparison ID as conversation ID
      userId: userId,
      modelId: Number(model1Config.id),
      messages,
      provider: String(model1Config.provider),
      modelIdString: String(model1Config.model_id),
      systemPrompt: 'You are a helpful AI assistant. Please provide a clear and concise response.',
      options: {
        reasoningEffort: 'medium',
        responseMode: 'standard'
      },
      source: 'compare',
      sessionId: session.sub
    };
    
    const job2Request: CreateJobRequest = {
      conversationId: comparisonId.toString(),
      userId: userId,
      modelId: Number(model2Config.id),
      messages,
      provider: String(model2Config.provider),
      modelIdString: String(model2Config.model_id),
      systemPrompt: 'You are a helpful AI assistant. Please provide a clear and concise response.',
      options: {
        reasoningEffort: 'medium',
        responseMode: 'standard'
      },
      source: 'compare',
      sessionId: session.sub
    };
    
    // Create both jobs
    const [job1Id, job2Id] = await Promise.all([
      jobManagementService.createJob(job1Request),
      jobManagementService.createJob(job2Request)
    ]);
    
    log.info('Both comparison jobs created successfully', sanitizeForLogging({
      job1Id,
      job2Id,
      comparisonId
    }));
    
    // 9. Send both jobs to SQS queue
    const queueUrl = getStreamingJobsQueueUrl();
    if (queueUrl) {
      try {
        await Promise.all([
          sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: job1Id,
            MessageAttributes: {
              jobType: { DataType: 'String', StringValue: 'ai-streaming-compare' },
              provider: { DataType: 'String', StringValue: String(model1Config.provider) },
              modelId: { DataType: 'String', StringValue: String(model1Config.model_id) },
              userId: { DataType: 'Number', StringValue: userId.toString() },
              source: { DataType: 'String', StringValue: 'compare' },
              comparisonId: { DataType: 'Number', StringValue: comparisonId.toString() }
            }
          })),
          sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: job2Id,
            MessageAttributes: {
              jobType: { DataType: 'String', StringValue: 'ai-streaming-compare' },
              provider: { DataType: 'String', StringValue: String(model2Config.provider) },
              modelId: { DataType: 'String', StringValue: String(model2Config.model_id) },
              userId: { DataType: 'Number', StringValue: userId.toString() },
              source: { DataType: 'String', StringValue: 'compare' },
              comparisonId: { DataType: 'Number', StringValue: comparisonId.toString() }
            }
          }))
        ]);
        
        log.info('Both comparison jobs sent to SQS queue successfully', sanitizeForLogging({
          job1Id,
          job2Id
        }));
      } catch (sqsError) {
        log.error('Failed to send comparison jobs to SQS queue', sanitizeForLogging({
          job1Id,
          job2Id,
          error: sqsError instanceof Error ? sqsError.message : String(sqsError)
        }));
        
        // Mark both jobs as failed if we can't queue them
        try {
          await Promise.all([
            jobManagementService.failJob(job1Id, `Failed to queue job: ${sqsError}`),
            jobManagementService.failJob(job2Id, `Failed to queue job: ${sqsError}`)
          ]);
        } catch (failError) {
          log.error('Failed to mark jobs as failed', { job1Id, job2Id, error: failError });
        }
        
        throw ErrorFactories.externalServiceError('SQS', new Error('Failed to queue comparison jobs for processing'));
      }
    } else {
      log.warn('No SQS queue URL configured, jobs created but not queued', { job1Id, job2Id });
    }
    
    // 10. Return job information for client polling
    timer({ 
      status: 'success',
      job1Id,
      job2Id,
      comparisonId,
      operation: 'jobs_created'
    });
    
    return new Response(JSON.stringify({
      job1Id,
      job2Id,
      comparisonId,
      status: 'pending',
      message: 'Comparison jobs created successfully. Poll both jobs for results.',
      requestId,
      model1: {
        id: model1Id,
        name: model1Name || String(model1Config.name),
        provider: String(model1Config.provider)
      },
      model2: {
        id: model2Id,
        name: model2Name || String(model2Config.name),
        provider: String(model2Config.provider)
      }
    }), {
      status: 202, // Accepted - processing asynchronously
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        'X-Job-1-Id': job1Id,
        'X-Job-2-Id': job2Id,
        'X-Comparison-Id': comparisonId.toString(),
        'X-Universal-Polling': 'true'
      }
    });
    
  } catch (error) {
    log.error('Compare API error', { 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    return new Response(
      JSON.stringify({
        error: 'Failed to process comparison request',
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