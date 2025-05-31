"use client"

import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import { hasToolAccess } from "@/utils/roles"

export function useToolAccess(toolIdentifier: string) {
  const { user } = useUser()
  const [hasAccess, setHasAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkAccess() {
      if (!user) {
        setHasAccess(false)
        setIsLoading(false)
        return
      }

      try {
        const access = await hasToolAccess(user.id, toolIdentifier)
        setHasAccess(access)
      } catch (error) {
        console.error("Error checking tool access", error)
        setHasAccess(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAccess()
  }, [user, toolIdentifier])

  return { hasAccess, isLoading }
} 