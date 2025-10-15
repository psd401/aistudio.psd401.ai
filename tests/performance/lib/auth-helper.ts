/**
 * Authentication Helper for Performance Testing
 *
 * Provides utilities for authenticating requests during performance tests.
 * Reuses patterns from e2e tests for consistency.
 */

import { getTestEnvironment } from '../config';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/**
 * Get authentication token for performance tests
 *
 * For local development, this can use a test user or mock token.
 * For staging/production, this should use proper authentication flow.
 */
export async function getAuthToken(): Promise<string | undefined> {
  const env = getTestEnvironment();

  // If token is provided via environment, use it
  if (env.authToken) {
    return env.authToken;
  }

  // If test user credentials are provided, authenticate
  if (env.testUser) {
    return authenticateTestUser(env.testUser);
  }

  // For local testing, token may not be required if auth is disabled
  // or if using a local mock server
  return undefined;
}

/**
 * Authenticate test user and get access token
 *
 * This is a placeholder implementation. In a real scenario, this would:
 * 1. Call the Cognito authentication endpoint
 * 2. Exchange credentials for tokens
 * 3. Return the access token
 */
async function authenticateTestUser(
  credentials: AuthCredentials
): Promise<string> {
  // TODO: Implement actual authentication flow using AWS Cognito
  // For now, this is a placeholder that assumes local testing

  console.warn(
    'Auth helper: Using placeholder authentication. Implement proper Cognito auth for staging/production testing.'
  );

  // In local development, we can skip auth or use a mock token
  // In CI/CD, we should use a service account with proper credentials
  return 'mock-token-for-local-testing';
}

/**
 * Create authenticated fetch headers
 */
export function createAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}
