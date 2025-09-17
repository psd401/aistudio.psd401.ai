"use server"

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  AuthFlowType
} from "@aws-sdk/client-cognito-identity-provider"
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"
import { handleError, createSuccess } from "@/lib/error-utils"
import type { ActionState } from "@/types/actions-types"

interface RefreshTokenParams {
  refreshToken: string
  tokenSub: string
}

interface RefreshedTokens {
  accessToken: string
  idToken: string
  refreshToken?: string
  expiresAt: number
}

interface CognitoRefreshResponse {
  AuthenticationResult?: {
    AccessToken?: string
    IdToken?: string
    RefreshToken?: string
    ExpiresIn?: number
  }
}

// Rate limiting configuration
const MAX_REFRESH_ATTEMPTS = 5 // Maximum attempts per user per time window
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute window
const refreshAttempts = new Map<string, { count: number; lastAttempt: number; windowStart: number }>()

/**
 * Checks if a user has exceeded the rate limit for token refresh attempts
 * Implements a sliding window rate limiter to prevent abuse
 *
 * @param userId - User identifier (token.sub)
 * @returns boolean - true if rate limited, false if allowed
 */
function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const attemptKey = userId
  const attempts = refreshAttempts.get(attemptKey)

  if (!attempts) {
    // First attempt, record it
    refreshAttempts.set(attemptKey, {
      count: 1,
      lastAttempt: now,
      windowStart: now
    })
    return false
  }

  // Check if we're in a new time window
  if (now - attempts.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // Reset the window
    refreshAttempts.set(attemptKey, {
      count: 1,
      lastAttempt: now,
      windowStart: now
    })
    return false
  }

  // Check if we've exceeded the limit within the current window
  if (attempts.count >= MAX_REFRESH_ATTEMPTS) {
    return true
  }

  // Increment attempt count
  refreshAttempts.set(attemptKey, {
    count: attempts.count + 1,
    lastAttempt: now,
    windowStart: attempts.windowStart
  })

  return false
}

/**
 * Cleans up old rate limiting entries to prevent memory leaks
 * Should be called periodically to remove expired entries
 */
function cleanupRateLimitingEntries(): void {
  const now = Date.now()
  for (const [userId, attempts] of refreshAttempts.entries()) {
    if (now - attempts.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      refreshAttempts.delete(userId)
    }
  }
}

/**
 * Server action to refresh AWS Cognito tokens
 * Runs in Node.js runtime to avoid Edge Runtime compatibility issues with AWS SDK
 *
 * @param params - Refresh token parameters
 * @returns Promise<ActionState<RefreshedTokens>> - Action result with new tokens or error
 */
export async function refreshCognitoToken(params: RefreshTokenParams): Promise<ActionState<RefreshedTokens>> {
  const requestId = generateRequestId()
  const timer = startTimer("refreshCognitoToken")
  const log = createLogger({ requestId, action: "refreshCognitoToken" })

  try {
    log.info("Token refresh action started", {
      tokenSub: params.tokenSub
    })

    // Input validation
    if (!params.refreshToken || typeof params.refreshToken !== 'string' || params.refreshToken.length < 10) {
      log.warn("Invalid refresh token provided", { tokenSub: params.tokenSub })
      throw new Error("Invalid refresh token")
    }

    if (!params.tokenSub || typeof params.tokenSub !== 'string') {
      log.warn("Invalid token sub provided")
      throw new Error("Invalid token sub")
    }

    // Check rate limiting
    if (isRateLimited(params.tokenSub)) {
      log.warn("Token refresh blocked due to rate limiting", { tokenSub: params.tokenSub })
      throw new Error("Rate limit exceeded. Please try again later.")
    }

    // Clean up old rate limiting entries periodically (every 100th call)
    if (Math.random() < 0.01) {
      cleanupRateLimitingEntries()
    }

    const clientId = process.env.AUTH_COGNITO_CLIENT_ID
    if (!clientId) {
      log.error("AUTH_COGNITO_CLIENT_ID environment variable not set")
      throw new Error("Authentication configuration error")
    }

    log.info("Attempting Cognito token refresh", { tokenSub: params.tokenSub })

    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || "us-east-1"
    })

    const authParams: InitiateAuthCommandInput = {
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: params.refreshToken
      }
    }

    const command = new InitiateAuthCommand(authParams)
    const response: CognitoRefreshResponse = await client.send(command)

    if (!response.AuthenticationResult) {
      log.warn("Token refresh failed - no authentication result returned", {
        tokenSub: params.tokenSub
      })
      throw new Error("Token refresh failed")
    }

    const authResult = response.AuthenticationResult
    const newExpiresAt = Date.now() + ((authResult.ExpiresIn || 3600) * 1000)

    if (!authResult.AccessToken || !authResult.IdToken) {
      log.warn("Token refresh failed - missing required tokens", {
        tokenSub: params.tokenSub,
        hasAccessToken: !!authResult.AccessToken,
        hasIdToken: !!authResult.IdToken
      })
      throw new Error("Incomplete token refresh response")
    }

    log.info("Token refresh successful", {
      tokenSub: params.tokenSub,
      newExpiresAt: new Date(newExpiresAt).toISOString(),
      hasNewRefreshToken: !!authResult.RefreshToken,
      expiresInSeconds: authResult.ExpiresIn || 3600
    })

    const refreshedTokens: RefreshedTokens = {
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      // Use new refresh token if provided, otherwise keep existing one
      refreshToken: authResult.RefreshToken || params.refreshToken,
      expiresAt: newExpiresAt
    }

    timer({ status: "success" })
    log.info("Token refresh action completed successfully")
    return createSuccess(refreshedTokens, "Token refreshed successfully")

  } catch (error) {
    timer({ status: "error" })

    // Check for specific Cognito errors that indicate permanent failure
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      if (errorMessage.includes('refresh token is expired') ||
          errorMessage.includes('invalid refresh token') ||
          errorMessage.includes('refresh token has been revoked')) {
        log.warn("Refresh token is permanently invalid - user needs to re-authenticate", {
          tokenSub: params.tokenSub,
          errorType: 'permanent_failure'
        })
      }
    }

    return handleError(error, "Failed to refresh authentication token. Please sign in again.", {
      context: "refreshCognitoToken",
      requestId,
      operation: "refreshCognitoToken",
      metadata: {
        tokenSub: params.tokenSub,
        errorType: "token_refresh_failed"
      }
    })
  }
}