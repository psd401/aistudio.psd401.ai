/**
 * AWS SQS Queue configuration service
 * Centralized logic for queue URL construction and validation
 */

import { createLogger } from '@/lib/logger'

/**
 * Queue configuration service with proper error handling and validation
 */
export class QueueConfigService {
  private readonly log = createLogger({ module: 'QueueConfigService' })

  /**
   * Get the streaming jobs queue URL with comprehensive error handling
   */
  getStreamingJobsQueueUrl(): string {
    this.log.debug('Getting streaming jobs queue URL')

    // First try direct env var
    if (process.env.STREAMING_JOBS_QUEUE_URL) {
      this.log.debug('Using direct STREAMING_JOBS_QUEUE_URL env var')
      return process.env.STREAMING_JOBS_QUEUE_URL
    }

    // Otherwise construct from available env vars
    const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'dev'
    const region = process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || 'us-east-1'

    this.log.debug('Constructing queue URL from environment variables', { environment, region })

    // Extract account ID from RDS ARN (format: arn:aws:rds:region:account:...)
    const rdsArn = process.env.RDS_RESOURCE_ARN
    if (!rdsArn) {
      const error = 'No RDS_RESOURCE_ARN found and no direct STREAMING_JOBS_QUEUE_URL provided'
      this.log.error('Queue URL configuration error', { error })
      throw new Error(`Queue configuration error: ${error}`)
    }

    const accountMatch = rdsArn.match(/:(\d{12}):/)
    if (!accountMatch) {
      const error = 'Failed to extract AWS account ID from RDS ARN'
      this.log.error('Queue URL configuration error', { error, rdsArn: this.sanitizeArn(rdsArn) })
      throw new Error(`Queue configuration error: ${error}`)
    }

    const account = accountMatch[1]
    const queueUrl = `https://sqs.${region}.amazonaws.com/${account}/aistudio-${environment}-streaming-jobs-queue`

    this.log.info('Constructed queue URL successfully', { 
      environment, 
      region, 
      account: account.substring(0, 4) + '****' + account.substring(8) // Partially mask account ID
    })

    return queueUrl
  }

  /**
   * Validate queue URL format
   */
  validateQueueUrl(queueUrl: string): boolean {
    const sqsUrlPattern = /^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d{12}\/[a-zA-Z0-9-_]+$/
    return sqsUrlPattern.test(queueUrl)
  }

  /**
   * Get queue name from URL
   */
  getQueueNameFromUrl(queueUrl: string): string | null {
    const match = queueUrl.match(/\/([^\/]+)$/)
    return match ? match[1] : null
  }

  /**
   * Sanitize ARN for logging (partial masking)
   */
  private sanitizeArn(arn: string): string {
    // Replace account ID in ARN with partial mask
    return arn.replace(/:(\d{4})\d{4}(\d{4}):/, ':$1****$2:')
  }
}

/**
 * Singleton instance for use throughout the app
 */
export const queueConfigService = new QueueConfigService()

/**
 * Convenience function for getting streaming jobs queue URL
 */
export function getStreamingJobsQueueUrl(): string {
  return queueConfigService.getStreamingJobsQueueUrl()
}