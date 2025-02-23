"use client"

import { useEffect, useState } from "react"
import { CommunicationAnalysis } from "./communication-analysis"
import { SelectAudience, SelectAnalysisPrompt, SelectAiModel } from "@/types"
import { toast } from "sonner"

interface AudienceConfig {
  audience: SelectAudience
  model: SelectAiModel | null
  prompt: SelectAnalysisPrompt | null
}

export function CommunicationAnalysisClientWrapper() {
  const [audiences, setAudiences] = useState<SelectAudience[]>([])
  const [configs, setConfigs] = useState<AudienceConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch audiences
        const audiencesRes = await fetch("/api/communication-analysis/audiences")
        if (!audiencesRes.ok) {
          throw new Error(`Failed to fetch audiences: ${audiencesRes.statusText}`)
        }
        const audiencesResult = await audiencesRes.json()
        
        if (!audiencesResult.isSuccess) {
          throw new Error(audiencesResult.message || "Failed to fetch audiences")
        }

        // Add a meta-analysis audience if it doesn't exist
        const metaAudience = {
          id: "meta",
          name: "Meta Analysis",
          description: "Analysis across all audiences"
        }
        const allAudiences = [metaAudience, ...audiencesResult.data]
        setAudiences(allAudiences)

        // Fetch prompts (which now includes model configurations)
        const promptsRes = await fetch("/api/communication-analysis/prompts")
        if (!promptsRes.ok) {
          throw new Error(`Failed to fetch prompts: ${promptsRes.statusText}`)
        }
        const promptsResult = await promptsRes.json()
        
        if (!promptsResult.isSuccess) {
          throw new Error(promptsResult.message || "Failed to fetch prompts")
        }

        // Map configurations using only the prompts data
        const allConfigs = allAudiences.map(audience => {
          const existingPrompt = promptsResult.data.find(
            (p: any) => {
              if (audience.id === "meta") {
                return p.isMetaAnalysis === true
              }
              return p.audienceId === audience.id && !p.isMetaAnalysis
            }
          )
          return {
            audience,
            model: existingPrompt?.model || null,
            prompt: existingPrompt || null
          }
        })
        setConfigs(allConfigs)
      } catch (error) {
        console.error("Error loading data:", error)
        toast.error(error instanceof Error ? error.message : "Failed to load configuration data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <CommunicationAnalysis
      audiences={audiences}
      configs={configs}
    />
  )
} 