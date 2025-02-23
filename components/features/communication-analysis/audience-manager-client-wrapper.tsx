"use client"

import { useEffect, useState } from "react"
import { AudienceManager } from "./audience-manager"
import { SelectAudience } from "@/types"
import { toast } from "sonner"

export function AudienceManagerClientWrapper() {
  const [audiences, setAudiences] = useState<SelectAudience[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAudiences() {
      try {
        const response = await fetch("/api/communication-analysis/audiences")
        const result = await response.json()
        if (result.isSuccess) {
          setAudiences(result.data)
        } else {
          toast.error(result.message)
        }
      } catch (error) {
        toast.error("Failed to load audiences")
      } finally {
        setIsLoading(false)
      }
    }

    fetchAudiences()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return <AudienceManager initialAudiences={audiences} />
} 