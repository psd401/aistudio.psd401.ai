"use client"

import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import { hasRole } from "@/utils/roles"
import { redirect } from "next/navigation"

interface WithRoleCheckProps {
  children: React.ReactNode
  role: string
  redirectTo?: string
}

export function WithRoleCheck({
  children,
  role,
  redirectTo = "/"
}: WithRoleCheckProps) {
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
        const access = await hasRole(user.id, role)
        setHasAccess(access)
      } catch (error) {
        console.error("Error checking role access:", error)
        setHasAccess(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAccess()
  }, [user, role])

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!hasAccess) {
    redirect(redirectTo)
  }

  return children
} 