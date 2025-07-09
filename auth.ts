import NextAuth from "next-auth"
import Cognito from "next-auth/providers/cognito"
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  providers: [
    Cognito({
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
      checks: ["pkce", "nonce"], // Enable both PKCE and nonce checks
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
        return null;
      }

      // Check if token is expired
      if (token.expiresAt && Date.now() > (token.expiresAt as number)) {
        return null;
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
      }
      
      // Store tokens in session for server-side use (e.g., GlobalSignOut)
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
    async signIn({ user, account, profile }) {
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
    maxAge: 24 * 60 * 60, // 24 hours
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
  },
  debug: false,
  events: {
    async signOut(message) {
      // This event fires after NextAuth's signOut
      // We can use this for any cleanup needed
      // User signed out
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)