"use client"

import { useEffect, useState } from "react"
import { TechniquesManager } from "./techniques-manager"
import { SelectMetaPromptingTechnique, SelectAiModel } from "@/db/schema"
import { toast } from "sonner"

export function TechniquesManagerClientWrapper() {
  const [techniques, setTechniques] = useState<SelectMetaPromptingTechnique[]>([])
  const [availableModels, setAvailableModels] = useState<SelectAiModel[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch techniques
        const techniquesRes = await fetch("/api/meta-prompting/techniques")
        const techniquesResult = await techniquesRes.json()
        
        if (techniquesResult.isSuccess) {
          setTechniques(techniquesResult.data)
        } else {
          toast.error(techniquesResult.message)
        }

        // Fetch models
        const modelsRes = await fetch("/api/admin/models")
        const modelsResult = await modelsRes.json()
        
        if (modelsResult.isSuccess) {
          setAvailableModels(modelsResult.data)
        } else {
          toast.error(modelsResult.message)
        }
      } catch (error) {
        toast.error("Failed to load data")
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

  return <TechniquesManager initialTechniques={techniques} availableModels={availableModels} />
} 