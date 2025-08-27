"use server"

import { ActionState } from "@/types"
import { getServerSession } from "@/lib/auth/server-session"
import { 
  handleError,
  ErrorFactories,
  createSuccess
} from "@/lib/error-utils"
import {
  createLogger,
  generateRequestId,
  startTimer,
  sanitizeForLogging
} from "@/lib/logger"
import { jobManagementService, type StreamingJob } from "@/lib/streaming/job-management-service"

export async function getStreamingJobAction(jobId: string): Promise<ActionState<StreamingJob | null>> {
  const requestId = generateRequestId()
  const timer = startTimer("getStreamingJob")
  const log = createLogger({ requestId, action: "getStreamingJob" })
  
  try {
    log.info("Action started: Getting streaming job", { jobId })
    
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized streaming job access attempt")
      throw ErrorFactories.authNoSession()
    }
    
    log.debug("User authenticated", { userId: session.sub })
    
    const job = await jobManagementService.getJob(jobId)
    
    if (!job) {
      log.warn("Streaming job not found", { jobId })
      return createSuccess(null, "Job not found")
    }

    log.info("Streaming job retrieved successfully", {
      jobId: job.id,
      status: job.status
    })
    
    timer({ status: "success", jobId: job.id })
    
    return createSuccess(job, "Streaming job retrieved successfully")
  } catch (error) {
    timer({ status: "error" })
    
    return handleError(error, "Failed to get streaming job. Please try again or contact support.", {
      context: "getStreamingJob",
      requestId,
      operation: "getStreamingJob",
      metadata: { jobId }
    })
  }
}

export async function cancelStreamingJobAction(jobId: string): Promise<ActionState<boolean>> {
  const requestId = generateRequestId()
  const timer = startTimer("cancelStreamingJob")
  const log = createLogger({ requestId, action: "cancelStreamingJob" })
  
  try {
    log.info("Action started: Cancelling streaming job", { jobId })
    
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized streaming job cancel attempt")
      throw ErrorFactories.authNoSession()
    }
    
    log.debug("User authenticated", { userId: session.sub })
    
    const success = await jobManagementService.cancelJob(jobId)
    
    if (success) {
      log.info("Streaming job cancelled successfully", { jobId })
      timer({ status: "success", jobId })
      return createSuccess(true, "Job cancelled successfully")
    } else {
      log.warn("Failed to cancel streaming job", { jobId })
      timer({ status: "error", jobId })
      return createSuccess(false, "Failed to cancel job")
    }
  } catch (error) {
    timer({ status: "error" })
    
    return handleError(error, "Failed to cancel streaming job. Please try again or contact support.", {
      context: "cancelStreamingJob",
      requestId,
      operation: "cancelStreamingJob",
      metadata: { jobId }
    })
  }
}