"use client"

import { useEffect, useState } from "react"
import { PromptManager } from "./prompt-manager"
import { SelectPoliticalPrompt, SelectPoliticalContext, SelectAiModel } from "@/types"
import { getPoliticalPromptsAction, getPoliticalContextsAction } from "@/actions/db/political-wording-actions"
import { getAiModelsAction } from "@/actions/db/ai-models-actions"
import { toast } from "sonner"

export function PromptManagerClientWrapper() {
  const [prompts, setPrompts] = useState<SelectPoliticalPrompt[]>([])
  const [contexts, setContexts] = useState<SelectPoliticalContext[]>([])
  const [models, setModels] = useState<SelectAiModel[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [promptsResponse, contextsResponse, modelsResponse] = await Promise.all([
          getPoliticalPromptsAction(),
          getPoliticalContextsAction(),
          getAiModelsAction()
        ])

        if (!promptsResponse.isSuccess) {
          toast.error(promptsResponse.message)
          return
        }

        if (!contextsResponse.isSuccess) {
          toast.error(contextsResponse.message)
          return
        }

        if (!modelsResponse.isSuccess) {
          toast.error(modelsResponse.message)
          return
        }

        setPrompts(promptsResponse.data)
        setContexts(contextsResponse.data)
        setModels(modelsResponse.data)
      } catch (error) {
        toast.error("Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  if (isLoading) {
    return <div>Loading...</div>
  }

  return <PromptManager 
    initialPrompts={prompts} 
    contexts={contexts}
    models={models}
  />
} 