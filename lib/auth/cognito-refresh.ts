import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  AuthFlowType
} from "@aws-sdk/client-cognito-identity-provider"
import { createLogger } from "@/lib/logger"
import type { JWT } from "next-auth/jwt"

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

const log = createLogger({ context: "cognito-refresh" })

/**
 * Refreshes AWS Cognito tokens using the refresh token
 *
 * @param token - Current JWT token containing refresh token
 * @returns Promise<RefreshedTokens | null> - New tokens or null if refresh failed
 */
export async function refreshAccessToken(token: JWT): Promise<RefreshedTokens | null> {
  const refreshToken = token.refreshToken as string

  if (!refreshToken) {
    log.warn("No refresh token available for token refresh")
    return null
  }

  const clientId = process.env.AUTH_COGNITO_CLIENT_ID
  if (!clientId) {
    log.error("AUTH_COGNITO_CLIENT_ID environment variable not set")
    return null
  }

  try {
    log.info("Attempting token refresh", {
      tokenSub: token.sub,
      tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt as number).toISOString() : 'unknown'
    })

    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || "us-east-1"
    })

    const params: InitiateAuthCommandInput = {
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    }

    const command = new InitiateAuthCommand(params)
    const response: CognitoRefreshResponse = await client.send(command)

    if (!response.AuthenticationResult) {
      log.warn("Token refresh failed - no authentication result returned", {
        tokenSub: token.sub
      })
      return null
    }

    const authResult = response.AuthenticationResult
    const newExpiresAt = Date.now() + ((authResult.ExpiresIn || 3600) * 1000)

    if (!authResult.AccessToken || !authResult.IdToken) {
      log.warn("Token refresh failed - missing required tokens", {
        tokenSub: token.sub,
        hasAccessToken: !!authResult.AccessToken,
        hasIdToken: !!authResult.IdToken
      })
      return null
    }

    log.info("Token refresh successful", {
      tokenSub: token.sub,
      newExpiresAt: new Date(newExpiresAt).toISOString(),
      hasNewRefreshToken: !!authResult.RefreshToken,
      expiresInSeconds: authResult.ExpiresIn || 3600
    })

    const refreshedTokens: RefreshedTokens = {
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      // Use new refresh token if provided, otherwise keep existing one
      refreshToken: authResult.RefreshToken || refreshToken,
      expiresAt: newExpiresAt
    }

    return refreshedTokens

  } catch (error) {
    log.error("Token refresh failed with error", {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      tokenSub: token.sub
    })

    // Check for specific Cognito errors that indicate permanent failure
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      if (errorMessage.includes('refresh token is expired') ||
          errorMessage.includes('invalid refresh token') ||
          errorMessage.includes('refresh token has been revoked')) {
        log.warn("Refresh token is permanently invalid - user needs to re-authenticate", {
          tokenSub: token.sub,
          errorType: 'permanent_failure'
        })
      }
    }

    return null
  }
}

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

  // Calculate 75% of the original token lifetime for proactive refresh
  // Default Cognito access token lifetime is 1 hour (3600 seconds)
  const assumedTokenLifetime = 3600 * 1000 // 1 hour in milliseconds
  const refreshThreshold = assumedTokenLifetime * 0.25 // 25% remaining = refresh time

  const shouldRefresh = timeUntilExpiry <= refreshThreshold

  if (shouldRefresh) {
    log.debug("Token should be refreshed proactively", {
      tokenSub: token.sub,
      timeUntilExpiryMinutes: Math.round(timeUntilExpiry / (1000 * 60)),
      refreshThresholdMinutes: Math.round(refreshThreshold / (1000 * 60))
    })
  }

  return shouldRefresh
}

/**
 * Helper function to safely extract token expiration time with fallback
 *
 * @param expiresIn - Expires in seconds from Cognito
 * @returns number - Timestamp in milliseconds
 */
export function calculateTokenExpiration(expiresIn?: number): number {
  const defaultExpiry = 3600 // 1 hour default
  const expiry = expiresIn || defaultExpiry
  return Date.now() + (expiry * 1000)
}