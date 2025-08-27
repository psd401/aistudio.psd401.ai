import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { jobManagementService } from '@/lib/streaming/job-management-service';
import type { UniversalPollingStatus } from '@/lib/streaming/job-management-service';
import { hasToolAccess } from '@/utils/roles';
import { executeSQL } from '@/lib/db/data-api-adapter';

/**
 * Compare Job Polling API Endpoint
 * GET /api/compare/jobs/[jobId] - Poll individual job status for model comparison
 * DELETE /api/compare/jobs/[jobId] - Cancel individual running job
 * 
 * This endpoint reuses the existing Nexus job polling infrastructure
 * but adds compare-specific formatting and response data.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer('api.compare.jobs.poll');
  const log = createLogger({ requestId, route: 'api.compare.jobs.poll' });
  
  const { jobId } = await params;
  
  log.info('Polling compare job status', { jobId });
  
  try {
    // 1. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session', { jobId });
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 2. Check tool access
    const hasAccess = await hasToolAccess("model-compare");
    if (!hasAccess) {
      log.warn('Model compare access denied', { userId: session.sub, jobId });
      timer({ status: 'error', reason: 'access_denied' });
      return new Response('Access denied', { status: 403 });
    }
    
    // 3. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user', { jobId });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 4. Load job from database
    const job = await jobManagementService.getJob(jobId);
    if (!job) {
      log.warn('Compare job not found', { jobId, userId: currentUser.data.user.id });
      timer({ status: 'error', reason: 'job_not_found' });
      return new Response(JSON.stringify({
        error: 'Job not found',
        jobId,
        requestId
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 5. Verify job ownership
    if (job.userId !== currentUser.data.user.id) {
      log.warn('Compare job access denied - wrong user', { 
        jobId, 
        jobUserId: job.userId,
        requestUserId: currentUser.data.user.id 
      });
      timer({ status: 'error', reason: 'access_denied' });
      return new Response(JSON.stringify({
        error: 'Access denied',
        jobId,
        requestId
      }), {
        status: 403,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 6. Verify job is from compare - check if conversation_id corresponds to a model_comparison
    const conversationId = job.conversationId;
    
    // For compare jobs, conversation_id should be a comparison record ID (numeric string)
    const comparisonId = parseInt(conversationId);
    if (isNaN(comparisonId)) {
      log.warn('Job conversation ID is not a comparison ID', { 
        jobId,
        conversationId,
        expectedType: 'numeric string (comparison ID)'
      });
      timer({ status: 'error', reason: 'invalid_job_type' });
      return new Response(JSON.stringify({
        error: 'Job is not a model comparison job',
        jobId,
        requestId
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // Verify the comparison record exists and belongs to the user
    const comparisonCheck = await executeSQL(
      'SELECT id FROM model_comparisons WHERE id = :id AND user_id = :userId',
      [
        { name: 'id', value: { longValue: comparisonId } },
        { name: 'userId', value: { longValue: currentUser.data.user.id } }
      ]
    );
    
    if (comparisonCheck.length === 0) {
      log.warn('Job does not correspond to a valid comparison', { 
        jobId,
        comparisonId,
        userId: currentUser.data.user.id
      });
      timer({ status: 'error', reason: 'invalid_job_type' });
      return new Response(JSON.stringify({
        error: 'Job is not a model comparison job',
        jobId,
        requestId
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    log.debug('Compare job found and authorized', {
      jobId,
      status: job.status,
      userId: job.userId,
      conversationId: job.conversationId,
      createdAt: job.createdAt.toISOString(),
      hasPartialContent: !!job.partialContent,
      partialContentLength: job.partialContent?.length || 0
    });
    
    // 7. Calculate optimal polling interval based on model and status
    const pollingInterval = await jobManagementService.getOptimalPollingInterval(
      job.modelId, 
      job.status
    );
    
    // 8. Prepare compare-specific response based on job status
    const responseData = {
      jobId: job.id,
      comparisonId: job.conversationId, // Comparison ID stored as conversation ID
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      expiresAt: job.expiresAt?.toISOString(),
      
      // Model information from job request data
      modelId: job.requestData.modelId,
      provider: job.requestData.provider,
      
      // Progressive content (always include for streaming updates)
      partialContent: job.partialContent || '',
      progressInfo: job.progressInfo,
      
      // Final response data (only for completed jobs)
      responseData: job.status === 'completed' ? {
        text: job.responseData?.text || '',
        usage: job.responseData?.usage,
        finishReason: job.responseData?.finishReason,
        executionTime: job.completedAt && job.startedAt 
          ? job.completedAt.getTime() - job.startedAt.getTime()
          : undefined
      } : undefined,
      
      // Error information (only for failed jobs)
      errorMessage: job.status === 'failed' ? job.errorMessage : undefined,
      
      // Polling guidance
      pollingInterval,
      shouldContinuePolling: ['pending', 'processing', 'streaming'].includes(job.status),
      
      // Request metadata
      requestId
    };
    
    // 9. Set response headers based on job status
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      'X-Job-Id': jobId,
      'X-Job-Status': job.status,
      'X-Polling-Interval': pollingInterval.toString(),
      'X-Comparison-Id': job.conversationId
    };
    
    // Add caching headers based on job status
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      // Final states can be cached briefly
      responseHeaders['Cache-Control'] = 'private, max-age=60';
    } else {
      // Active jobs should not be cached
      responseHeaders['Cache-Control'] = 'private, no-cache, no-store, must-revalidate';
    }
    
    timer({ 
      status: 'success',
      jobStatus: job.status,
      pollingInterval,
      hasPartialContent: !!job.partialContent
    });
    
    log.info('Compare job status returned successfully', {
      jobId,
      status: job.status,
      pollingInterval,
      hasPartialContent: !!job.partialContent,
      shouldContinuePolling: responseData.shouldContinuePolling,
      comparisonId: job.conversationId
    });
    
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: responseHeaders
    });
    
  } catch (error) {
    log.error('Compare job polling error', { 
      jobId,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    return new Response(JSON.stringify({
      error: 'Failed to poll compare job status',
      jobId,
      requestId
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      }
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer('api.compare.jobs.cancel');
  const log = createLogger({ requestId, route: 'api.compare.jobs.cancel' });
  
  const { jobId } = await params;
  
  log.info('Cancelling compare job', { jobId });
  
  try {
    // 1. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session', { jobId });
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 2. Check tool access
    const hasAccess = await hasToolAccess("model-compare");
    if (!hasAccess) {
      log.warn('Model compare access denied', { userId: session.sub, jobId });
      timer({ status: 'error', reason: 'access_denied' });
      return new Response('Access denied', { status: 403 });
    }
    
    // 3. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user', { jobId });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 4. Load job to verify ownership and source
    const job = await jobManagementService.getJob(jobId);
    if (!job) {
      log.warn('Compare job not found for cancellation', { jobId, userId: currentUser.data.user.id });
      timer({ status: 'error', reason: 'job_not_found' });
      return new Response(JSON.stringify({
        error: 'Job not found',
        jobId,
        requestId
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 5. Verify job ownership
    if (job.userId !== currentUser.data.user.id) {
      log.warn('Compare job cancellation denied - wrong user', { 
        jobId, 
        jobUserId: job.userId,
        requestUserId: currentUser.data.user.id 
      });
      timer({ status: 'error', reason: 'access_denied' });
      return new Response(JSON.stringify({
        error: 'Access denied',
        jobId,
        requestId
      }), {
        status: 403,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 6. Verify job is from compare - check if conversation_id corresponds to a model_comparison
    const conversationId = job.conversationId;
    
    // For compare jobs, conversation_id should be a comparison record ID (numeric string)
    const comparisonId = parseInt(conversationId);
    if (isNaN(comparisonId)) {
      log.warn('Job conversation ID is not a comparison ID', { 
        jobId,
        conversationId,
        expectedType: 'numeric string (comparison ID)'
      });
      return new Response(JSON.stringify({
        error: 'Job is not a model comparison job',
        jobId,
        requestId
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // Verify the comparison record exists and belongs to the user
    const comparisonCheck = await executeSQL(
      'SELECT id FROM model_comparisons WHERE id = :id AND user_id = :userId',
      [
        { name: 'id', value: { longValue: comparisonId } },
        { name: 'userId', value: { longValue: currentUser.data.user.id } }
      ]
    );
    
    if (comparisonCheck.length === 0) {
      log.warn('Job does not correspond to a valid comparison', { 
        jobId,
        comparisonId,
        userId: currentUser.data.user.id
      });
      return new Response(JSON.stringify({
        error: 'Job is not a model comparison job',
        jobId,
        requestId
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 7. Check if job can be cancelled
    const cancellableStates: UniversalPollingStatus[] = ['pending', 'processing', 'streaming'];
    if (!cancellableStates.includes(job.status)) {
      log.info('Compare job not in cancellable state', { 
        jobId, 
        status: job.status,
        cancellableStates 
      });
      
      return new Response(JSON.stringify({
        error: `Job cannot be cancelled - current status: ${job.status}`,
        jobId,
        status: job.status,
        cancellableStates,
        requestId
      }), {
        status: 409, // Conflict
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': requestId 
        }
      });
    }
    
    // 8. Cancel the job
    const cancelled = await jobManagementService.cancelJob(jobId);
    
    if (cancelled) {
      log.info('Compare job cancelled successfully', { jobId });
      
      timer({ 
        status: 'success',
        operation: 'job_cancelled'
      });
      
      return new Response(JSON.stringify({
        success: true,
        jobId,
        status: 'cancelled',
        message: 'Compare job cancelled successfully',
        requestId
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
          'X-Job-Id': jobId,
          'X-Job-Status': 'cancelled'
        }
      });
    } else {
      log.warn('Compare job cancellation failed - no rows updated', { jobId });
      
      return new Response(JSON.stringify({
        error: 'Job cancellation failed - job may have already completed or been cancelled',
        jobId,
        requestId
      }), {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        }
      });
    }
    
  } catch (error) {
    log.error('Compare job cancellation error', { 
      jobId,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    return new Response(JSON.stringify({
      error: 'Failed to cancel compare job',
      jobId,
      requestId
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      }
    });
  }
}