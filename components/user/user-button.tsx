'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, signInWithRedirect, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function UserButton() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      try {
        const userData = await getCurrentUser();
        
        // Get the session to access the ID token
        try {
          const session = await fetchAuthSession();
          const idToken = session.tokens?.idToken;
          
          if (idToken?.payload) {
            setUserInfo({
              email: idToken.payload.email,
              given_name: idToken.payload.given_name,
              family_name: idToken.payload.family_name,
              name: idToken.payload.name,
              picture: idToken.payload.picture
            });
          }
        } catch (sessionError) {
          console.error('UserButton - Error fetching session:', sessionError);
        }
        
        setUser(userData);
      } catch (error) {
        console.error('UserButton - Error getting user:', error);
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
      await signOut();
      // Clear the accessToken cookie
      document.cookie = "accessToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      router.push("/");
    } catch (error) {
      console.error("Sign-out error:", error);
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