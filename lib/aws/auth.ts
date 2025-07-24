import { CognitoJwtVerifier } from "aws-jwt-verify"
import { cookies } from "next/headers"
import logger from '@/lib/logger'

// Initialize the verifier with your Cognito User Pool details
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!

const verifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "id",
  clientId: clientId,
})

export const getAuthenticatedUser = async () => {
  try {
    // Get the ID token from cookies
    const cookieStore = await cookies()
    const idTokenCookie = cookieStore.get(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`)
    
    if (!idTokenCookie) {
      return null
    }
    
    // In a real implementation, you would get the actual ID token
    // For now, return a placeholder user object
    return {
      userId: "temp-user-id",
      username: idTokenCookie.value
    }
  } catch (error) {
    logger.error("getAuthenticatedUser error:", error)
    return null
  }
}

// Helper function to verify JWT tokens when needed
export const verifyToken = async (token: string) => {
  try {
    const payload = await verifier.verify(token)
    return payload
  } catch (error) {
    logger.error("Token verification failed:", error)
    return null
  }
} 