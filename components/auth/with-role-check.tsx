"use client"

import { useEffect, useState } from "react"
import { getCurrentUser } from "aws-amplify/auth"
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
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    redirect(redirectTo)
  }

  return children
} 