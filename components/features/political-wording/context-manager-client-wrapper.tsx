"use client"

import { useEffect, useState } from "react"
import { ContextManager } from "./context-manager"
import { SelectPoliticalContext } from "@/types"
import { getPoliticalContextsAction } from "@/actions/db/political-wording-actions"
import { toast } from "sonner"

export function ContextManagerClientWrapper() {
  const [contexts, setContexts] = useState<SelectPoliticalContext[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadContexts = async () => {
      try {
        const response = await getPoliticalContextsAction()
        if (response.isSuccess) {
          setContexts(response.data)
        } else {
          toast.error(response.message)
        }
      } catch (error) {
        toast.error("Failed to load contexts")
      } finally {
        setIsLoading(false)
      }
    }

    loadContexts()
  }, [])

  if (isLoading) {
    return <div>Loading...</div>
  }

  return <ContextManager initialContexts={contexts} />
} 