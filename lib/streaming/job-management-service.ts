import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId } from '@/lib/logger';
import { transformSnakeToCamel } from '@/lib/db/field-mapper';
import type { UIMessage } from 'ai';

const log = createLogger({ module: 'job-management-service' });

/**
 * Job status enum matching existing database schema
 * Maps to existing job_status enum: pending, running, completed, failed
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Internal status mapping for universal polling
 */
export type UniversalPollingStatus = 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled';

/**
 * Map universal polling statuses to database enum values
 */
export function mapToDatabaseStatus(status: UniversalPollingStatus): JobStatus {
  switch (status) {
    case 'pending': return 'pending';
    case 'processing':
    case 'streaming': return 'running';
    case 'completed': return 'completed';
    case 'failed':
    case 'cancelled': return 'failed';
    default: return 'failed';
  }
}

/**
 * Map database status to universal polling status
 */
export function mapFromDatabaseStatus(dbStatus: JobStatus, errorMessage?: string): UniversalPollingStatus {
  switch (dbStatus) {
    case 'pending': return 'pending';
    case 'running': return 'processing'; // Default to processing, can be updated to streaming
    case 'completed': return 'completed';
    case 'failed': 
      // Check if this was a cancellation
      if (errorMessage?.includes('cancelled') || errorMessage?.includes('cancel')) {
        return 'cancelled';
      }
      return 'failed';
    default: return 'failed';
  }
}

/**
 * AI Streaming Job structure
 */
export interface StreamingJob {
  id: string;
  conversationId: string; // Always stored as text - can be integer (legacy) or UUID (nexus)
  nexusConversationId?: string; // For nexus-specific conversation ID
  userId: number;
  modelId: number;
  status: UniversalPollingStatus;
  requestData: {
    messages: UIMessage[];
    modelId: string;
    provider: string;
    systemPrompt?: string;
    options?: {
      reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
      responseMode?: 'standard' | 'flex' | 'priority';
      backgroundMode?: boolean;
      thinkingBudget?: number;
      imageGeneration?: {
        prompt: string;
        size?: '1024x1024' | '1792x1024' | '1024x1792' | '1536x1024' | '1024x1536';
        style?: 'natural' | 'vivid';
      };
    };
    maxTokens?: number;
    temperature?: number;
    tools?: unknown;
  };
  responseData?: {
    text: string;
    type?: 'text' | 'image';
    image?: string; // Base64 image data for image generation
    mediaType?: string; // MIME type for images
    prompt?: string; // Original prompt for image generation
    size?: string; // Image size
    style?: string; // Image style
    model?: string; // Model used for generation
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      totalCost?: number;
    };
    finishReason: string;
    metadata?: Record<string, unknown>; // Additional metadata
  };
  partialContent?: string;
  progressInfo?: {
    tokensStreamed?: number;
    completionPercentage?: number;
    currentPhase?: string;
    metadata?: Record<string, unknown>;
  };
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  source?: string;
  sessionId?: string;
  requestId?: string;
}

/**
 * Request to create a streaming job
 */
export interface CreateJobRequest {
  conversationId: string | number; // Support both legacy (number) and nexus (UUID string)
  userId: number;
  modelId: number;
  messages: UIMessage[];
  provider: string;
  modelIdString: string;
  systemPrompt?: string;
  options?: StreamingJob['requestData']['options'];
  maxTokens?: number;
  temperature?: number;
  tools?: unknown;
  source?: string;
  sessionId?: string;
}

/**
 * Progress update for a job
 */
export interface JobProgressUpdate {
  partialContent?: string;
  progressInfo?: Partial<StreamingJob['progressInfo']>;
  metadata?: Record<string, unknown>;
}

/**
 * Service for managing AI streaming jobs in the database
 * Handles job lifecycle from creation to completion/cleanup
 */
export class JobManagementService {
  
  /**
   * Create a new streaming job
   */
  async createJob(request: CreateJobRequest): Promise<string> {
    const requestId = generateRequestId();
    
    // Determine conversation type
    const conversationIdStr = String(request.conversationId);
    const isUuid = conversationIdStr.length === 36 && conversationIdStr.includes('-');
    const isNexus = request.source === 'nexus' || isUuid;
    
    log.info('Creating streaming job', {
      userId: request.userId,
      conversationId: request.conversationId,
      conversationIdStr,
      isNexus,
      isUuid,
      provider: request.provider,
      modelId: request.modelId,
      messageCount: request.messages.length,
      source: request.source || 'chat',
      requestId
    });

    try {
      // Prepare request data
      const requestData = {
        messages: request.messages,
        modelId: request.modelIdString,
        provider: request.provider,
        systemPrompt: request.systemPrompt,
        options: request.options,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        tools: request.tools
      };

      const result = await executeSQL(`
        INSERT INTO ai_streaming_jobs (
          conversation_id,
          user_id,
          model_id,
          status,
          request_data
        ) VALUES (
          :conversation_id,
          :user_id,
          :model_id,
          'pending',
          :request_data::jsonb
        ) RETURNING id
      `, [
        { name: 'conversation_id', value: { stringValue: conversationIdStr } },
        { name: 'user_id', value: { longValue: request.userId } },
        { name: 'model_id', value: { longValue: request.modelId } },
        { name: 'request_data', value: { stringValue: JSON.stringify(requestData) } }
      ]);

      // Extract job ID from result
      const jobId = result?.[0]?.id as string;
      if (!jobId) {
        throw new Error('Failed to create streaming job - no ID returned');
      }

      log.info('Streaming job created successfully', {
        jobId,
        userId: request.userId,
        conversationId: request.conversationId,
        requestId
      });

      return jobId;
    } catch (error) {
      log.error('Failed to create streaming job', {
        error,
        userId: request.userId,
        conversationId: request.conversationId,
        requestId
      });
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<StreamingJob | null> {
    try {
      const result = await executeSQL(`
        SELECT 
          id,
          conversation_id,
          user_id,
          model_id,
          status,
          request_data,
          response_data,
          partial_content,
          error_message,
          created_at,
          completed_at
        FROM ai_streaming_jobs
        WHERE id = :job_id::uuid
      `, [
        { name: 'job_id', value: { stringValue: jobId } }
      ]);

      if (!result || result.length === 0) {
        return null;
      }

      const row = transformSnakeToCamel<Record<string, unknown>>(result[0]);
      
      const conversationId = row.conversationId as string;
      const isUuid = conversationId.length === 36 && conversationId.includes('-');
      
      return {
        id: row.id as string,
        conversationId,
        nexusConversationId: isUuid ? conversationId : undefined,
        userId: row.userId as number,
        modelId: row.modelId as number,
        status: mapFromDatabaseStatus(row.status as JobStatus, row.errorMessage as string),
        requestData: typeof row.requestData === 'string' ? (() => {
          try {
            return JSON.parse(row.requestData);
          } catch (error) {
            log.error('Failed to parse request data', {
              jobId: row.id,
              error: error instanceof Error ? error.message : String(error)
            });
            return null;
          }
        })() : row.requestData as StreamingJob['requestData'],
        responseData: row.responseData ? (typeof row.responseData === 'string' ? (() => {
          try {
            return JSON.parse(row.responseData);
          } catch (error) {
            log.error('Failed to parse response data', {
              jobId: row.id,
              error: error instanceof Error ? error.message : String(error)
            });
            return null;
          }
        })() : row.responseData as StreamingJob['responseData']) : undefined,
        partialContent: row.partialContent as string | undefined,
        progressInfo: {},
        errorMessage: row.errorMessage as string | undefined,
        createdAt: new Date(row.createdAt as string),
        startedAt: row.startedAt ? new Date(row.startedAt as string) : undefined,
        completedAt: row.completedAt ? new Date(row.completedAt as string) : undefined,
        expiresAt: row.expiresAt ? new Date(row.expiresAt as string) : undefined
      };
    } catch (error) {
      log.error('Failed to get job', { jobId, error });
      throw error;
    }
  }

  /**
   * Get jobs for a user (for polling)
   */
  async getUserJobs(userId: number, limit: number = 10): Promise<StreamingJob[]> {
    try {
      const result = await executeSQL(`
        SELECT 
          id,
          conversation_id,
          nexus_conversation_id,
          legacy_conversation_id,
          user_id,
          model_id,
          status,
          request_data,
          response_data,
          partial_content,
          progress_info,
          error_message,
          created_at,
          started_at,
          completed_at,
          expires_at,
          source,
          session_id,
          request_id
        FROM ai_streaming_jobs
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
      `, [
        { name: 'user_id', value: { longValue: userId } },
        { name: 'limit', value: { longValue: limit } }
      ]);

      return result.map((row: Record<string, unknown>) => {
        const transformed = transformSnakeToCamel<Record<string, unknown>>(row);
        return {
          id: transformed.id as string,
          conversationId: transformed.conversationId as string,
          nexusConversationId: transformed.nexusConversationId as string | undefined,
          legacyConversationId: transformed.legacyConversationId as number | undefined,
          userId: transformed.userId as number,
          modelId: transformed.modelId as number,
          status: mapFromDatabaseStatus(transformed.status as JobStatus, transformed.errorMessage as string),
          requestData: typeof transformed.requestData === 'string' ? JSON.parse(transformed.requestData) : transformed.requestData as StreamingJob['requestData'],
          responseData: transformed.responseData ? (typeof transformed.responseData === 'string' ? JSON.parse(transformed.responseData) : transformed.responseData as StreamingJob['responseData']) : undefined,
          partialContent: transformed.partialContent as string | undefined,
          progressInfo: transformed.progressInfo ? (typeof transformed.progressInfo === 'string' ? JSON.parse(transformed.progressInfo) : transformed.progressInfo as StreamingJob['progressInfo']) : {},
          errorMessage: transformed.errorMessage as string | undefined,
          createdAt: new Date(transformed.createdAt as string),
          startedAt: transformed.startedAt ? new Date(transformed.startedAt as string) : undefined,
          completedAt: transformed.completedAt ? new Date(transformed.completedAt as string) : undefined,
          expiresAt: new Date(transformed.expiresAt as string),
          source: transformed.source as string | undefined,
          sessionId: transformed.sessionId as string | undefined,
          requestId: transformed.requestId as string | undefined
        };
      });
    } catch (error) {
      log.error('Failed to get user jobs', { userId, error });
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string, 
    status: UniversalPollingStatus, 
    progressUpdate?: JobProgressUpdate,
    errorMessage?: string
  ): Promise<boolean> {
    log.debug('Updating job status', {
      jobId,
      status,
      hasProgressUpdate: !!progressUpdate,
      hasError: !!errorMessage
    });

    try {
      const dbStatus = mapToDatabaseStatus(status);
      const finalErrorMessage = status === 'cancelled' ? `Job cancelled by user${errorMessage ? ': ' + errorMessage : ''}` : errorMessage;
      
      const result = await executeSQL(`
        SELECT update_job_status(
          :job_id::uuid,
          :status::job_status,
          :partial_content,
          :progress_info,
          :error_message
        ) as success
      `, [
        { name: 'job_id', value: { stringValue: jobId } },
        { name: 'status', value: { stringValue: dbStatus } },
        { name: 'partial_content', value: progressUpdate?.partialContent ? { stringValue: progressUpdate.partialContent } : { isNull: true } },
        { name: 'progress_info', value: progressUpdate?.progressInfo ? { stringValue: JSON.stringify(progressUpdate.progressInfo) } : { isNull: true } },
        { name: 'error_message', value: finalErrorMessage ? { stringValue: finalErrorMessage } : { isNull: true } }
      ]);

      const success = result?.[0]?.success as boolean || false;
      
      if (success) {
        log.debug('Job status updated successfully', { jobId, status });
      } else {
        log.warn('Job status update returned false', { jobId, status });
      }

      return success;
    } catch (error) {
      log.error('Failed to update job status', { jobId, status, error });
      throw error;
    }
  }

  /**
   * Complete job with final response data
   */
  async completeJob(
    jobId: string,
    responseData: StreamingJob['responseData'],
    finalContent?: string
  ): Promise<boolean> {
    log.info('Completing job', { jobId, hasResponseData: !!responseData });

    try {
      const result = await executeSQL(`
        UPDATE ai_streaming_jobs 
        SET 
          status = 'completed',
          response_data = :response_data,
          partial_content = COALESCE(:final_content, partial_content),
          completed_at = NOW()
        WHERE id = :job_id::uuid
        RETURNING id
      `, [
        { name: 'job_id', value: { stringValue: jobId } },
        { name: 'response_data', value: { stringValue: JSON.stringify(responseData) } },
        { name: 'final_content', value: finalContent ? { stringValue: finalContent } : { isNull: true } }
      ]);

      const success = result && result.length > 0;
      
      if (success) {
        log.info('Job completed successfully', { jobId });
      } else {
        log.error('Job completion failed - no rows updated', { jobId });
      }

      return success;
    } catch (error) {
      log.error('Failed to complete job', { jobId, error });
      throw error;
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, errorMessage: string): Promise<boolean> {
    log.warn('Marking job as failed', { jobId, errorMessage });

    try {
      const result = await executeSQL(`
        UPDATE ai_streaming_jobs 
        SET 
          status = 'failed',
          error_message = :error_message,
          completed_at = NOW()
        WHERE id = :job_id::uuid
        RETURNING id
      `, [
        { name: 'job_id', value: { stringValue: jobId } },
        { name: 'error_message', value: { stringValue: errorMessage } }
      ]);

      const success = result && result.length > 0;
      
      if (success) {
        log.info('Job marked as failed', { jobId });
      } else {
        log.error('Failed to mark job as failed - no rows updated', { jobId });
      }

      return success;
    } catch (error) {
      log.error('Failed to mark job as failed', { jobId, error });
      throw error;
    }
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    log.info('Cancelling job', { jobId });

    try {
      const result = await executeSQL(`
        UPDATE ai_streaming_jobs 
        SET 
          status = 'failed',
          error_message = 'Job cancelled by user',
          completed_at = NOW()
        WHERE id = :job_id::uuid 
          AND status IN ('pending', 'running')
        RETURNING id
      `, [
        { name: 'job_id', value: { stringValue: jobId } }
      ]);

      const success = result && result.length > 0;
      
      if (success) {
        log.info('Job cancelled successfully', { jobId });
      } else {
        log.warn('Job cancellation failed or job not in cancellable state', { jobId });
      }

      return success;
    } catch (error) {
      log.error('Failed to cancel job', { jobId, error });
      throw error;
    }
  }

  /**
   * Get pending jobs for worker processing
   */
  async getPendingJobs(limit: number = 10): Promise<StreamingJob[]> {
    try {
      const result = await executeSQL(`
        SELECT 
          id,
          conversation_id,
          nexus_conversation_id,
          legacy_conversation_id,
          user_id,
          model_id,
          status,
          request_data,
          response_data,
          partial_content,
          progress_info,
          error_message,
          created_at,
          started_at,
          completed_at,
          expires_at,
          source,
          session_id,
          request_id
        FROM ai_streaming_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
      `, [
        { name: 'limit', value: { longValue: limit } }
      ]);

      return result.map((row: Record<string, unknown>) => {
        const transformed = transformSnakeToCamel<Record<string, unknown>>(row);
        return {
          id: transformed.id as string,
          conversationId: transformed.conversationId as string,
          nexusConversationId: transformed.nexusConversationId as string | undefined,
          legacyConversationId: transformed.legacyConversationId as number | undefined,
          userId: transformed.userId as number,
          modelId: transformed.modelId as number,
          status: mapFromDatabaseStatus(transformed.status as JobStatus, transformed.errorMessage as string),
          requestData: typeof transformed.requestData === 'string' ? JSON.parse(transformed.requestData) : transformed.requestData as StreamingJob['requestData'],
          responseData: transformed.responseData ? (typeof transformed.responseData === 'string' ? JSON.parse(transformed.responseData) : transformed.responseData as StreamingJob['responseData']) : undefined,
          partialContent: transformed.partialContent as string | undefined,
          progressInfo: transformed.progressInfo ? (typeof transformed.progressInfo === 'string' ? JSON.parse(transformed.progressInfo) : transformed.progressInfo as StreamingJob['progressInfo']) : {},
          errorMessage: transformed.errorMessage as string | undefined,
          createdAt: new Date(transformed.createdAt as string),
          startedAt: transformed.startedAt ? new Date(transformed.startedAt as string) : undefined,
          completedAt: transformed.completedAt ? new Date(transformed.completedAt as string) : undefined,
          expiresAt: new Date(transformed.expiresAt as string),
          source: transformed.source as string | undefined,
          sessionId: transformed.sessionId as string | undefined,
          requestId: transformed.requestId as string | undefined
        };
      });
    } catch (error) {
      log.error('Failed to get pending jobs', { error });
      throw error;
    }
  }

  /**
   * Cleanup expired jobs
   */
  async cleanupExpiredJobs(): Promise<number> {
    log.info('Running job cleanup');

    try {
      const result = await executeSQL(`
        SELECT cleanup_expired_streaming_jobs() as deleted_count
      `, []);

      const deletedCount = result?.[0]?.deletedCount as number || 0;
      
      if (deletedCount > 0) {
        log.info('Cleaned up expired jobs', { deletedCount });
      } else {
        log.debug('No expired jobs to clean up');
      }

      return deletedCount;
    } catch (error) {
      log.error('Failed to cleanup expired jobs', { error });
      throw error;
    }
  }

  /**
   * Get optimal polling interval for a model based on database metadata
   */
  async getOptimalPollingInterval(modelId: number, status: UniversalPollingStatus): Promise<number> {
    try {
      // Get model capabilities from database
      const result = await executeSQL(`
        SELECT nexus_capabilities, average_latency_ms 
        FROM ai_models 
        WHERE id = :model_id
      `, [
        { name: 'model_id', value: { longValue: modelId } }
      ]);

      if (!result || result.length === 0) {
        // Default interval if model not found
        return 1000;
      }

      const model = result[0];
      const capabilitiesStr = model.nexusCapabilities as string || '{}';
      const capabilities = JSON.parse(capabilitiesStr);
      const averageLatency = (model.averageLatencyMs as number) || 5000;

      // Base interval based on model characteristics
      let baseInterval = 1000; // 1 second default
      
      if (capabilities.reasoning) {
        baseInterval = 1500; // Slower polling for reasoning models
      } else if (averageLatency < 3000) {
        baseInterval = 500; // Faster polling for quick models
      }

      // Adjust based on job status
      switch (status) {
        case 'pending':
          return baseInterval; // Normal polling while waiting
        case 'processing':
          return baseInterval * 2; // Slower while initializing
        case 'streaming':
          return baseInterval; // Normal polling during streaming
        case 'completed':
        case 'failed':
        case 'cancelled':
          return baseInterval * 3; // Slower for terminal states
        default:
          return baseInterval;
      }
    } catch (error) {
      log.error('Failed to get optimal polling interval', { modelId, error });
      return 1000; // Default fallback
    }
  }
}

// Singleton instance
export const jobManagementService = new JobManagementService();