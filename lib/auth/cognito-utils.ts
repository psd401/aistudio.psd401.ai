/**
 * Utility functions for AWS Cognito authentication
 */

/**
 * Builds the Cognito logout URL with the specified redirect URI
 * @param origin - The origin URL (e.g., https://example.com)
 * @returns The complete Cognito logout URL
 */
export function buildCognitoLogoutUrl(origin: string): string {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.AUTH_COGNITO_CLIENT_ID;
  
  if (!cognitoDomain || !clientId) {
    throw new Error('Missing required Cognito configuration');
  }
  
  const logoutUri = `${origin}/`;
  return `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
}