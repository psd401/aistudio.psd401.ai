"use client";

import { Amplify } from "aws-amplify"
import { Hub } from "aws-amplify/utils"
import { PropsWithChildren, useEffect } from "react"
import { getCurrentUser } from "aws-amplify/auth"

import { config } from "@/app/utils/amplifyConfig"

Amplify.configure(config, { ssr: true })

export default function AmplifyProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const checkUser = async () => {
      try {
        await getCurrentUser()
      } catch {
        // User is not authenticated
      }
    }

    // Initial check
    checkUser()

    // Listen for auth events
    const hubListener = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "tokenRefresh":
          checkUser()
          break
        case "signedOut":
          // User is signed out
          break
      }
    })

    return () => {
      hubListener()
    }
  }, [])

  return <>{children}</>
} 