"use client";

import { Amplify } from "aws-amplify"
import { Hub } from "aws-amplify/utils"
import { PropsWithChildren, useEffect, useState } from "react"
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth"

import { config } from "@/app/utils/amplifyConfig"

Amplify.configure(config, { ssr: true })

export default function AmplifyProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<any | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } catch (error) {
        setUser(null)
      }
    }

    // Initial check
    checkUser()

    // Listen for auth events
    const hubListener = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signIn":
        case "tokenRefresh":
          checkUser()
          break
        case "signedOut":
        case "signOut":
          setUser(null)
          break
        case "signIn_failure":
          setUser(null)
          break
      }
    })

    return () => {
      hubListener()
    }
  }, [])

  return <>{children}</>
} 