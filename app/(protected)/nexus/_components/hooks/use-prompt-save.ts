"use client"

import { useState, useCallback } from "react"
import { createPrompt } from "@/actions/prompt-library.actions"
import { toast } from "@/components/ui/use-toast"
import type { CreatePromptInput } from "@/lib/prompt-library/validation"
import type { Prompt } from "@/lib/prompt-library/types"

interface UsePromptSaveReturn {
  savePrompt: (input: CreatePromptInput) => Promise<{ success: boolean; data?: Prompt }>
  isSaving: boolean
}

/**
 * Hook for saving prompts to the library
 * Handles loading state and error/success notifications
 */
export function usePromptSave(): UsePromptSaveReturn {
  const [isSaving, setIsSaving] = useState(false)

  const savePrompt = useCallback(
    async (input: CreatePromptInput) => {
      setIsSaving(true)

      try {
        const result = await createPrompt(input)

        if (!result.isSuccess) {
          const errorMessage = result.error instanceof Error
            ? result.error.message
            : result.message || "An error occurred"

          toast({
            variant: "destructive",
            title: "Failed to save prompt",
            description: errorMessage
          })
          return { success: false }
        }

        toast({
          title: "Prompt saved",
          description: "Added to your prompt library"
        })

        return { success: true, data: result.data }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to save prompt",
          description: error instanceof Error ? error.message : "An error occurred"
        })
        return { success: false }
      } finally {
        setIsSaving(false)
      }
    },
    []
  )

  return {
    savePrompt,
    isSaving
  }
}
