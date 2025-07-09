"use client"

import { ReactNode } from "react"
import { useUser } from "@/components/auth/user-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

interface WithRoleCheckProps {
  children: ReactNode
  role: string
  redirectTo?: string
}

export function WithRoleCheck({
  children,
  role,
  redirectTo = "/"
}: WithRoleCheckProps) {
  const { user, roles, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push(redirectTo)
      } else {
        const hasRole = roles.some(r => r.name === role)
        if (!hasRole) {
          router.push(redirectTo)
        }
      }
    }
  }, [loading, user, roles, role, redirectTo, router])

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return null
  }

  const hasRole = roles.some(r => r.name === role)
  if (!hasRole) {
    return null
  }

  return <>{children}</>
} 