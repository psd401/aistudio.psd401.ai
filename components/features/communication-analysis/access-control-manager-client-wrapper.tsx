"use client"

import { useEffect, useState } from "react"
import { AccessControlManager } from "./access-control-manager"
import { SelectCommunicationSettings } from "@/types"
import { toast } from "sonner"

export function AccessControlManagerClientWrapper() {
  const [settings, setSettings] = useState<SelectCommunicationSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/communication-analysis/settings")
        const result = await response.json()
        if (result.isSuccess) {
          setSettings(result.data)
        } else {
          toast.error(result.message)
        }
      } catch (error) {
        toast.error("Failed to load settings")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [])

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return <AccessControlManager initialSettings={settings} />
} 