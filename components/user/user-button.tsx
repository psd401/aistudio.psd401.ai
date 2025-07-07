'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, signInWithRedirect, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { clearAuthCookiesClient } from "@/lib/auth/cookie-utils";

export function UserButton() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      try {
        // First try to get the auth session
        const session = await fetchAuthSession();
        
        if (session.tokens?.idToken) {
          // If we have tokens, try to get the current user
          try {
            const userData = await getCurrentUser();
            setUser(userData);
            
            const idToken = session.tokens.idToken;
            if (idToken?.payload) {
              setUserInfo({
                email: idToken.payload.email,
                given_name: idToken.payload.given_name,
                family_name: idToken.payload.family_name,
                name: idToken.payload.name,
                picture: idToken.payload.picture
              });
            }
          } catch (userError) {
            // Even if getCurrentUser fails, we might still have valid session tokens
            console.error('UserButton - Error getting current user:', userError);
            // Use token payload as fallback
            const idToken = session.tokens.idToken;
            if (idToken?.payload) {
              setUser({ username: idToken.payload.sub, userId: idToken.payload.sub });
              setUserInfo({
                email: idToken.payload.email,
                given_name: idToken.payload.given_name,
                family_name: idToken.payload.family_name,
                name: idToken.payload.name,
                picture: idToken.payload.picture
              });
            }
          }
        } else {
          setUser(null);
          setUserInfo(null);
        }
      } catch (error) {
        // If fetchAuthSession fails, user is not authenticated
        console.error('UserButton - Error fetching auth session:', error);
        setUser(null);
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    const hubListener = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          checkUser();
          break;
        case 'signedOut':
          setUser(null);
          setUserInfo(null);
          setLoading(false);
          break;
      }
    });

    return () => {
      hubListener();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      // First, sign out with Amplify (global sign out)
      await signOut({ global: true });
      
      // Call server-side sign out to clear HttpOnly cookies
      await fetch("/api/auth/signout", { 
        method: "POST",
        credentials: "include"
      });
      
      // Clear all authentication cookies client-side
      clearAuthCookiesClient();
      
      // Clear state immediately
      setUser(null);
      setUserInfo(null);
      
      // Force a full page reload to clear any cached auth state
      window.location.href = "/";
    } catch (error) {
      console.error("Sign-out error:", error);
      
      // Even if sign out fails, clear cookies and redirect
      try {
        await fetch("/api/auth/signout", { 
          method: "POST",
          credentials: "include"
        });
      } catch {}
      
      clearAuthCookiesClient();
      window.location.href = "/";
    }
  };

  if (loading) {
    return (
      <Button size="sm" variant="outline" disabled>
        ...
      </Button>
    );
  }

  if (!user) {
    return (
      <Button size="sm" variant="outline" onClick={() => signInWithRedirect()}>
        Sign in
      </Button>
    );
  }

  // Use user info from ID token, with fallbacks
  const displayName =
    userInfo?.given_name || 
    userInfo?.name ||
    userInfo?.email || 
    user.username || 
    user.userId || 
    "User"

  return (
    <div className="flex items-center gap-2">
      <Avatar>
        <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium">{displayName}</span>
      <Button size="sm" variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
} 