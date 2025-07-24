"use client"

import { useEffect, useState } from "react"
import { useUser } from "@/components/auth/user-provider"

export function useToolAccess(toolName: string): {
  hasAccess: boolean
  loading: boolean
} {
  const { user, loading: userLoading } = useUser()
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAccess() {
      if (!user || userLoading) {
        setHasAccess(false)
        setLoading(!userLoading)
        return
      }

      try {
        const response = await fetch(`/api/auth/user-tools`)
        if (response.ok) {
          const tools = await response.json()
          setHasAccess(tools.includes(toolName))
        } else {
          setHasAccess(false)
        }
      } catch (error) {
        console.error("Error checking tool access:", error)
        setHasAccess(false)
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
  }, [user, userLoading, toolName])

  return { hasAccess, loading }
} 