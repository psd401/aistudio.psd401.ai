import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId } from '@/lib/logger';
import { transformSnakeToCamel } from '@/lib/db/field-mapper';
import type { UIMessage } from 'ai';

const log = createLogger({ module: 'job-management-service' });

/**
 * Job status enum matching database schema
 */
export type JobStatus = 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled';

/**
 * AI Streaming Job structure
 */
export interface StreamingJob {
  id: string;
  conversationId: number;
  userId: number;
  modelId: number;
  status: JobStatus;
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
    };
    maxTokens?: number;
    temperature?: number;
    tools?: unknown;
  };
  responseData?: {
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      totalCost?: number;
    };
    finishReason: string;
  };
  partialContent?: string;
  progressInfo: {
    tokensStreamed?: number;
    completionPercentage?: number;
    currentPhase?: string;
    metadata?: Record<string, unknown>;
  };
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
  source?: string;
  sessionId?: string;
  requestId?: string;
}

/**
 * Request to create a streaming job
 */
export interface CreateJobRequest {
  conversationId: number;
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
    log.info('Creating streaming job', {
      userId: request.userId,
      conversationId: request.conversationId,
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
          request_data,
          progress_info,
          source,
          session_id,
          request_id,
          expires_at
        ) VALUES (
          :conversation_id,
          :user_id,
          :model_id,
          'pending',
          :request_data,
          '{}',
          :source,
          :session_id,
          :request_id,
          NOW() + INTERVAL '2 hours'
        ) RETURNING id
      `, [
        { name: 'conversation_id', value: { longValue: request.conversationId } },
        { name: 'user_id', value: { longValue: request.userId } },
        { name: 'model_id', value: { longValue: request.modelId } },
        { name: 'request_data', value: { stringValue: JSON.stringify(requestData) } },
        { name: 'source', value: { stringValue: request.source || 'chat' } },
        { name: 'session_id', value: request.sessionId ? { stringValue: request.sessionId } : { isNull: true } },
        { name: 'request_id', value: { stringValue: requestId } }
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
        WHERE id = :job_id
      `, [
        { name: 'job_id', value: { stringValue: jobId } }
      ]);

      if (!result || result.length === 0) {
        return null;
      }

      const row = transformSnakeToCamel<Record<string, unknown>>(result[0]);
      
      return {
        id: row.id as string,
        conversationId: row.conversationId as number,
        userId: row.userId as number,
        modelId: row.modelId as number,
        status: row.status as JobStatus,
        requestData: typeof row.requestData === 'string' ? JSON.parse(row.requestData) : row.requestData as StreamingJob['requestData'],
        responseData: row.responseData ? (typeof row.responseData === 'string' ? JSON.parse(row.responseData) : row.responseData as StreamingJob['responseData']) : undefined,
        partialContent: row.partialContent as string | undefined,
        progressInfo: row.progressInfo ? (typeof row.progressInfo === 'string' ? JSON.parse(row.progressInfo) : row.progressInfo as StreamingJob['progressInfo']) : {},
        errorMessage: row.errorMessage as string | undefined,
        createdAt: new Date(row.createdAt as string),
        startedAt: row.startedAt ? new Date(row.startedAt as string) : undefined,
        completedAt: row.completedAt ? new Date(row.completedAt as string) : undefined,
        expiresAt: new Date(row.expiresAt as string),
        source: row.source as string | undefined,
        sessionId: row.sessionId as string | undefined,
        requestId: row.requestId as string | undefined
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
          conversationId: transformed.conversationId as number,
          userId: transformed.userId as number,
          modelId: transformed.modelId as number,
          status: transformed.status as JobStatus,
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
    status: JobStatus, 
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
        { name: 'status', value: { stringValue: status } },
        { name: 'partial_content', value: progressUpdate?.partialContent ? { stringValue: progressUpdate.partialContent } : { isNull: true } },
        { name: 'progress_info', value: progressUpdate?.progressInfo ? { stringValue: JSON.stringify(progressUpdate.progressInfo) } : { isNull: true } },
        { name: 'error_message', value: errorMessage ? { stringValue: errorMessage } : { isNull: true } }
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
        WHERE id = :job_id
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
        WHERE id = :job_id
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
          status = 'cancelled',
          completed_at = NOW()
        WHERE id = :job_id 
          AND status IN ('pending', 'processing', 'streaming')
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
          conversationId: transformed.conversationId as number,
          userId: transformed.userId as number,
          modelId: transformed.modelId as number,
          status: transformed.status as JobStatus,
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
  async getOptimalPollingInterval(modelId: number, status: JobStatus): Promise<number> {
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