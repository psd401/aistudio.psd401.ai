'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useComposerRuntime } from '@assistant-ui/react'
import { useAction } from '@/lib/hooks/use-action'
import { getPrompt } from '@/actions/prompt-library.actions'
import { toast } from 'sonner'
import { createLogger } from '@/lib/client-logger'

const log = createLogger({ moduleName: 'prompt-auto-loader' })

/**
 * Component that automatically loads and sends a prompt from the Prompt Library
 * when the promptId URL parameter is present.
 *
 * This enables the "Use Prompt" functionality from the Prompt Library.
 */
export function PromptAutoLoader() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const composer = useComposerRuntime()

  // Track which prompts we've already processed to prevent duplicate sends
  const processedPromptsRef = useRef<Set<string>>(new Set())

  const { execute: executeGetPrompt } = useAction(getPrompt, {
    showSuccessToast: false,
    showErrorToast: false
  })

  const promptId = searchParams.get('promptId')

  useEffect(() => {
    async function loadAndSendPrompt() {
      if (!promptId) return

      // Don't process the same prompt twice
      if (processedPromptsRef.current.has(promptId)) {
        log.debug('Prompt already processed, skipping', { promptId })
        return
      }

      // Check if composer is ready
      const composerState = composer.getState()
      if (!composerState) {
        log.warn('Composer not ready yet', { promptId })
        return
      }

      log.info('Loading prompt from library', { promptId })

      try {
        // Fetch the prompt
        const result = await executeGetPrompt(promptId)

        if (!result?.isSuccess || !result.data) {
          log.error('Failed to load prompt', { promptId, error: result?.message })
          toast.error('Failed to load prompt', {
            description: result?.message || 'Could not load the selected prompt'
          })
          // Remove promptId from URL on error
          const params = new URLSearchParams(searchParams.toString())
          params.delete('promptId')
          router.replace(`/nexus?${params.toString()}`)
          return
        }

        const prompt = result.data
        log.info('Prompt loaded successfully', {
          promptId,
          title: prompt.title,
          contentLength: prompt.content.length
        })

        // Mark as processed before sending to prevent race conditions
        processedPromptsRef.current.add(promptId)

        // Set the prompt content in the composer
        composer.setText(prompt.content)

        log.debug('Prompt text set in composer', { promptId })

        // Small delay to ensure the text is fully set before sending
        setTimeout(() => {
          // Send the message
          composer.send()

          log.info('Prompt sent to chat', { promptId })

          // Clean up URL by removing promptId parameter
          const params = new URLSearchParams(searchParams.toString())
          params.delete('promptId')
          const newUrl = params.toString() ? `/nexus?${params.toString()}` : '/nexus'
          router.replace(newUrl)

          log.debug('URL cleaned up', { newUrl })
        }, 100)

      } catch (error) {
        log.error('Error loading prompt', {
          promptId,
          error: error instanceof Error ? error.message : String(error)
        })
        toast.error('Error loading prompt', {
          description: 'An unexpected error occurred while loading the prompt'
        })
        // Remove promptId from URL on error
        const params = new URLSearchParams(searchParams.toString())
        params.delete('promptId')
        router.replace(`/nexus?${params.toString()}`)
      }
    }

    loadAndSendPrompt()
  }, [promptId, composer, executeGetPrompt, router, searchParams])

  // This component doesn't render anything - it's purely for side effects
  return null
}
