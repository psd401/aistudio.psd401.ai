"use server"

import { createAuth } from "@/auth"
import { redirect } from "next/navigation"
import { buildCognitoLogoutUrl } from "@/lib/auth/cognito-utils"

export async function signOutAction() {
  const { auth, signOut } = createAuth();
  const session = await auth();
  
  if (session) {
    // Sign out from NextAuth
    await signOut({ redirect: false });
    
    // Build Cognito logout URL
    const origin = process.env.AUTH_URL || 'http://localhost:3000';
    const cognitoLogoutUrl = buildCognitoLogoutUrl(origin);
    
    // Redirect to Cognito logout
    redirect(cognitoLogoutUrl);
  } else {
    // No session, just redirect to home
    redirect('/');
  }
}