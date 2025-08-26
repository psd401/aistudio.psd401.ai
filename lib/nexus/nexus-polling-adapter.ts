import type { ChatModelAdapter } from '@assistant-ui/react'
import { createLogger } from '@/lib/client-logger'

const log = createLogger({ moduleName: 'nexus-polling-adapter' })

export interface NexusJobResponse {
  jobId: string
  conversationId: string
  status: 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled'
  partialContent?: string
  responseData?: {
    text: string
    type?: 'text' | 'image'
    image?: string // Base64 image data for image generation
    mediaType?: string // MIME type for images
    prompt?: string // Original prompt for image generation
    size?: string // Image size
    style?: string // Image style
    model?: string // Model used for generation
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    finishReason: string
    metadata?: Record<string, unknown> // Additional metadata
  }
  errorMessage?: string
  pollingInterval: number
  shouldContinuePolling: boolean
  requestId: string
}

export interface NexusPollingAdapterOptions {
  apiUrl: string
  bodyFn?: () => Record<string, unknown>
  maxPollAttempts?: number
  pollTimeoutMs?: number
}

/**
 * Nexus Polling Adapter for assistant-ui
 * 
 * Converts the universal polling architecture into a streaming interface
 * that's compatible with assistant-ui's LocalRuntime.
 * 
 * Flow:
 * 1. Submit chat request → get 202 + jobId
 * 2. Poll job status endpoint → get progressive updates
 * 3. Convert polling updates → streaming format for assistant-ui
 * 4. Handle completion/errors → final response
 */
export function createNexusPollingAdapter(options: NexusPollingAdapterOptions): ChatModelAdapter {
  const { 
    apiUrl, 
    bodyFn = () => ({}),
    maxPollAttempts = 300, // 5 minutes with 1s intervals
    pollTimeoutMs = 30000 // 30 seconds per poll
  } = options

  return {
    async *run({ messages, abortSignal }) {
      log.debug('Starting Nexus chat request', { 
        messageCount: messages.length,
        apiUrl
      })

      let jobId: string | null = null
      let pollingInterval = 1000 // Start with 1 second
      let pollAttempts = 0

      try {
        // 1. Submit chat request to get job ID
        const chatResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            ...bodyFn()
          }),
          signal: abortSignal,
        })

        if (!chatResponse.ok) {
          throw new Error(`Chat request failed: ${chatResponse.status} ${chatResponse.statusText}`)
        }

        const chatData = await chatResponse.json()
        jobId = chatData.jobId

        if (!jobId) {
          throw new Error('No jobId received from chat request')
        }

        log.info('Job created successfully', { jobId })

        // 2. Poll for job updates
        while (pollAttempts < maxPollAttempts) {
          // Check for cancellation
          if (abortSignal.aborted) {
            // Cancel the job if possible
            try {
              await fetch(`${apiUrl}/jobs/${jobId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              })
              log.info('Job cancelled due to abort signal', { jobId })
            } catch (cancelError) {
              log.warn('Failed to cancel job', { jobId, error: cancelError })
            }
            return
          }

          // Wait before polling (except first attempt)
          if (pollAttempts > 0) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval))
          }

          pollAttempts++

          try {
            // Poll job status
            const pollController = new AbortController()
            const pollTimeout = setTimeout(() => pollController.abort(), pollTimeoutMs)

            const pollResponse = await fetch(`${apiUrl}/jobs/${jobId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              signal: pollController.signal,
            })

            clearTimeout(pollTimeout)

            if (!pollResponse.ok) {
              if (pollResponse.status === 404) {
                throw new Error('Job not found - it may have expired')
              }
              throw new Error(`Poll request failed: ${pollResponse.status} ${pollResponse.statusText}`)
            }

            const jobData: NexusJobResponse = await pollResponse.json()

            log.debug('Poll response received', {
              jobId,
              status: jobData.status,
              hasPartialContent: !!jobData.partialContent,
              shouldContinuePolling: jobData.shouldContinuePolling
            })

            // Update polling interval from server response
            if (jobData.pollingInterval) {
              pollingInterval = jobData.pollingInterval
            }

            // Yield progressive updates if we have partial content
            if (jobData.partialContent) {
              yield {
                content: [{ 
                  type: 'text' as const, 
                  text: jobData.partialContent 
                }],
              }
            }

            // Handle job completion
            if (jobData.status === 'completed') {
              if (jobData.responseData) {
                // Handle image generation responses
                if (jobData.responseData.type === 'image' && jobData.responseData.image) {
                  const { image, mediaType, prompt, size, model } = jobData.responseData
                  const dataUrl = `data:${mediaType || 'image/png'};base64,${image}`
                  
                  log.info('Image generation job completed', { 
                    jobId, 
                    prompt: prompt?.substring(0, 50) + (prompt && prompt.length > 50 ? '...' : ''),
                    size,
                    model,
                    imageSize: image.length
                  })

                  yield {
                    content: [
                      // Show the image
                      { 
                        type: 'image' as const, 
                        image: dataUrl
                      },
                      // Add text description
                      {
                        type: 'text' as const,
                        text: `Generated image: "${prompt}" (${size})`
                      }
                    ],
                  }
                } else {
                  // Handle regular text responses
                  const finalText = jobData.responseData.text || jobData.partialContent || 'Response completed.'
                  
                  log.info('Text job completed successfully', { 
                    jobId, 
                    textLength: finalText.length,
                    usage: jobData.responseData.usage
                  })

                  yield {
                    content: [{ 
                      type: 'text' as const, 
                      text: finalText 
                    }],
                  }
                }
              }
              return // Job completed successfully
            }

            // Handle job failure
            if (jobData.status === 'failed') {
              const errorMessage = jobData.errorMessage || 'Job processing failed'
              log.error('Job failed', { jobId, errorMessage })
              throw new Error(errorMessage)
            }

            // Handle job cancellation
            if (jobData.status === 'cancelled') {
              log.info('Job was cancelled', { jobId })
              return
            }

            // Continue polling if job is still in progress
            if (!jobData.shouldContinuePolling) {
              log.warn('Server indicated to stop polling but job not completed', { 
                jobId, 
                status: jobData.status 
              })
              break
            }

          } catch (pollError) {
            // Handle timeout or network errors during polling
            if (pollError instanceof Error && pollError.name === 'AbortError') {
              log.debug('Poll request timed out, will retry', { jobId, attempt: pollAttempts })
              continue // Retry on timeout
            }
            
            log.error('Poll request failed', { 
              jobId, 
              attempt: pollAttempts, 
              error: pollError instanceof Error ? pollError.message : String(pollError)
            })
            
            // For network errors, continue retrying up to max attempts
            if (pollAttempts < maxPollAttempts) {
              continue
            }
            throw pollError
          }
        }

        // If we exit the polling loop without completion, it's a timeout
        throw new Error(`Job polling timed out after ${pollAttempts} attempts`)

      } catch (error) {
        log.error('Nexus polling adapter error', { 
          jobId,
          error: error instanceof Error ? {
            message: error.message,
            name: error.name
          } : String(error)
        })

        // Re-throw the error so assistant-ui can display it
        throw error
      }
    }
  }
}