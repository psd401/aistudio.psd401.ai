/**
 * Edge Runtime compatible client for token refresh operations
 *
 * This module handles token refresh by calling server actions that run in Node.js runtime
 * instead of trying to use AWS SDK directly in Edge Runtime.
 */

import type { JWT } from "next-auth/jwt"
import { createLogger } from "@/lib/auth/edge-logger"

interface RefreshedTokens {
  accessToken: string
  idToken: string
  refreshToken?: string
  expiresAt: number
}

const log = createLogger({ context: "token-refresh-client" })

/**
 * Checks if a token is close to expiring and should be refreshed proactively
 * Refreshes when token has less than 25% of its lifetime remaining
 *
 * @param token - JWT token to check
 * @returns boolean - true if token should be refreshed
 */
export function shouldRefreshToken(token: JWT): boolean {
  if (!token.expiresAt) {
    return false
  }

  const expiresAt = token.expiresAt as number
  const now = Date.now()
  const timeUntilExpiry = expiresAt - now

  // If already expired, definitely refresh
  if (timeUntilExpiry <= 0) {
    return true
  }

  // Get configurable token lifetime from environment or calculate from token
  const configuredTokenLifetime = process.env.COGNITO_ACCESS_TOKEN_LIFETIME_SECONDS
    ? parseInt(process.env.COGNITO_ACCESS_TOKEN_LIFETIME_SECONDS) * 1000
    : null

  let tokenLifetime: number

  if (configuredTokenLifetime) {
    // Use configured lifetime from environment
    tokenLifetime = configuredTokenLifetime
  } else if (token.originalExpiresIn) {
    // Use original token lifetime if available
    tokenLifetime = (token.originalExpiresIn as number) * 1000
  } else {
    // Attempt to calculate from token creation time if available
    const tokenWithIat = token as JWT & { iat?: number }
    const tokenIssuedAt = tokenWithIat.iat ? tokenWithIat.iat * 1000 : null
    if (tokenIssuedAt) {
      tokenLifetime = expiresAt - tokenIssuedAt
    } else {
      // Fall back to default Cognito access token lifetime (1 hour)
      tokenLifetime = 3600 * 1000
      log.debug("Using default token lifetime assumption", {
        tokenSub: token.sub,
        defaultLifetimeHours: 1
      })
    }
  }

  // Calculate refresh threshold (when 25% of lifetime remains)
  const refreshThreshold = tokenLifetime * 0.25
  const shouldRefresh = timeUntilExpiry <= refreshThreshold

  if (shouldRefresh) {
    log.debug("Token should be refreshed proactively", {
      tokenSub: token.sub,
      timeUntilExpiryMinutes: Math.round(timeUntilExpiry / (1000 * 60)),
      refreshThresholdMinutes: Math.round(refreshThreshold / (1000 * 60)),
      tokenLifetimeHours: Math.round(tokenLifetime / (1000 * 60 * 60))
    })
  }

  return shouldRefresh
}

/**
 * Refreshes AWS Cognito tokens by calling the server action
 * This avoids Edge Runtime compatibility issues with AWS SDK
 *
 * @param token - Current JWT token containing refresh token
 * @returns Promise<RefreshedTokens | null> - New tokens or null if refresh failed
 */
export async function refreshAccessToken(token: JWT): Promise<RefreshedTokens | null> {
  // Input validation
  if (!token || typeof token !== 'object') {
    log.warn("Invalid token object provided to refreshAccessToken")
    return null
  }

  if (!token.sub || typeof token.sub !== 'string') {
    log.warn("Token missing required sub field")
    return null
  }

  const refreshToken = token.refreshToken as string

  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < 10) {
    log.warn("Invalid or missing refresh token", { tokenSub: token.sub })
    return null
  }

  try {
    log.info("Attempting token refresh via server action", {
      tokenSub: token.sub,
      tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt as number).toISOString() : 'unknown'
    })

    // Call the server action for token refresh
    const { refreshCognitoToken } = await import("@/actions/auth/refresh-token-action")
    const result = await refreshCognitoToken({
      refreshToken,
      tokenSub: token.sub as string
    })

    if (result.isSuccess && result.data) {
      log.info("Token refresh successful", {
        tokenSub: token.sub,
        newExpiresAt: new Date(result.data.expiresAt).toISOString()
      })

      return result.data
    } else {
      log.warn("Token refresh failed", {
        tokenSub: token.sub,
        message: result.message
      })
      return null
    }

  } catch (error) {
    log.error("Token refresh threw error", {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      tokenSub: token.sub
    })

    return null
  }
}