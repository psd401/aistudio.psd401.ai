import NextAuth from "next-auth"
import Cognito from "next-auth/providers/cognito"
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  providers: [
    Cognito({
      name: "AI Studio",
      clientId: process.env.AUTH_COGNITO_CLIENT_ID!,
      clientSecret: process.env.AUTH_COGNITO_CLIENT_SECRET || "",
      issuer: process.env.AUTH_COGNITO_ISSUER!,
      wellKnown: `${process.env.AUTH_COGNITO_ISSUER}/.well-known/openid-configuration`,
      authorization: {
        params: {
          scope: "openid email profile",
          response_type: "code",
          prompt: "login", // Force Cognito to show login screen and create new session
          redirect_uri: process.env.AUTH_URL ? `${process.env.AUTH_URL}/api/auth/callback/cognito` : undefined,
        },
      },
      client: {
        token_endpoint_auth_method: "none",
      },
      checks: ["pkce", "state", "nonce"], // Enable PKCE, state and nonce checks (CSRF protection)
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.given_name || profile.family_name,
          email: profile.email,
          image: profile.picture,
        }
      },
    })
  ],
  callbacks: {
    async jwt({ token, account, profile, user, trigger }) {
      // Initial sign in - store essential data
      if (account && account.id_token) {
        try {
          // Parse JWT payload without using jsonwebtoken library (Edge Runtime compatible)
          const base64Payload = account.id_token.split('.')[1];
          const payload = Buffer.from(base64Payload, 'base64').toString('utf-8');
          const decoded = JSON.parse(payload);
        
        return {
          sub: decoded.sub,
          email: decoded.email,
          name: decoded.name || decoded.given_name || decoded.preferred_username || decoded.email,
          given_name: decoded.given_name,
          family_name: decoded.family_name,
          preferred_username: decoded.preferred_username,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000, // Convert to milliseconds
          };
        } catch (error) {
          // Log error but don't fail authentication
          // This handles malformed tokens gracefully
          return {
            sub: account.providerAccountId,
            email: user?.email || profile?.email,
            name: user?.name || profile?.name,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            idToken: account.id_token,
            expiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
          };
        }
      }

      // Check if token is expired
      if (token.expiresAt && Date.now() > (token.expiresAt as number)) {
        // Token has expired, trigger sign out
        return null;
      }

      // Return existing token
      return token;
    },
    async session({ session, token }) {
      // Check if token exists and is valid
      if (!token || !token.sub) {
        return session; // Return empty session instead of null
      }

      // Check if token is expired
      if (token.expiresAt && Date.now() > (token.expiresAt as number)) {
        return session;
      }
      
      // Send properties to the client
      const givenName = token.given_name as string;
      const familyName = token.family_name as string;
      const fullName = token.name as string;
      const preferredUsername = token.preferred_username as string;
      const email = token.email as string;
      
      // Use given_name as display name, with multiple fallbacks
      const displayName = givenName || fullName || preferredUsername || familyName || email;
      
      session.user = {
        ...session.user,
        id: token.sub as string,
        email: email,
        name: displayName,
        givenName: givenName || null,
        familyName: familyName || null,
      }
      
      // Store tokens in session for server-side use
      // NOTE: These tokens are necessary for:
      // - accessToken: Making authenticated API calls to AWS services
      // - idToken: Contains user claims and is used for identity verification
      // - refreshToken: Required for token refresh when accessToken expires
      // 
      // Security considerations:
      // - These tokens are encrypted in the JWT session cookie
      // - Never log or expose these tokens in client-side code
      // - Consider implementing token rotation for enhanced security
      session.accessToken = token.accessToken as string;
      session.idToken = token.idToken as string;
      session.refreshToken = token.refreshToken as string;
      
      return session
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl + "/dashboard"
    },
    async signIn() {
      return true;
    },
  },
  pages: {
    // We'll use the default NextAuth pages for now
    // Can customize later if needed
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    // Session max age in seconds (default: 24 hours)
    maxAge: process.env.SESSION_MAX_AGE ? parseInt(process.env.SESSION_MAX_AGE) : 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: `authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    callbackUrl: {
      name: `authjs.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    csrfToken: {
      name: `authjs.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    pkceCodeVerifier: {
      name: `authjs.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15 // 15 minutes
      }
    },
    state: {
      name: `authjs.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15 // 15 minutes
      }
    },
    nonce: {
      name: `authjs.nonce`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
  },
  debug: false,
  events: {
    async signOut() {
      // This event fires after NextAuth's signOut
      // We can use this for any cleanup needed
      // User signed out
    },
  },
}

// Factory function - creates new instance per request
export function createAuth() {
  return NextAuth(authConfig)
}

// For middleware only - stateless operations
// This is safe because middleware doesn't maintain user-specific state
const middlewareAuth = NextAuth(authConfig)
export const { auth: authMiddleware } = middlewareAuth

// Export auth handlers for route.ts files
// These need to be created per-request in the route handlers
export function createAuthHandlers() {
  const { handlers } = createAuth()
  return handlers
}