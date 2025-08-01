"use server"

import { createAuth } from "@/auth"
import { redirect } from "next/navigation"

export async function signOutAction() {
  const { auth, signOut } = createAuth();
  const session = await auth();
  
  if (session) {
    // Sign out from NextAuth
    await signOut({ redirect: false });
    
    // Build Cognito logout URL
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.AUTH_COGNITO_CLIENT_ID;
    const logoutUri = process.env.AUTH_URL || 'http://localhost:3000';
    
    const cognitoLogoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri + '/')}`;
    
    // Redirect to Cognito logout
    redirect(cognitoLogoutUrl);
  } else {
    // No session, just redirect to home
    redirect('/');
  }
}