"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { signInWithRedirect, fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useState, Suspense } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Hub } from "aws-amplify/utils";

function LandingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Check authentication status
    const checkAuth = async () => {
      console.log("[Landing] Checking auth status...");
      
      // Check for OAuth callback parameters
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      
      if (code) {
        console.log("[Landing] OAuth callback detected");
        setIsProcessing(true);
        
        // Give Amplify time to process the OAuth callback
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      try {
        // Check auth session first
        const session = await fetchAuthSession();
        console.log("[Landing] Auth session:", { hasTokens: !!session.tokens });
        
        if (session.tokens?.accessToken) {
          // We have valid tokens, get user and redirect
          const user = await getCurrentUser();
          console.log("[Landing] User authenticated:", user.username);
          
          if (mounted) {
            router.push("/dashboard");
          }
        } else {
          console.log("[Landing] No valid session");
          if (mounted) {
            setIsProcessing(false);
          }
        }
      } catch (error) {
        console.log("[Landing] Auth check error:", error);
        if (mounted) {
          setIsProcessing(false);
        }
      }
    };

    checkAuth();

    // Listen for auth events
    const hubListener = Hub.listen("auth", ({ payload }) => {
      console.log("[Landing] Auth event:", payload.event);
      
      switch (payload.event) {
        case "signedIn":
        case "signIn":
        case "tokenRefresh":
        case "signInWithRedirect":
          // User signed in successfully
          if (mounted) {
            checkAuth(); // Re-check auth status
          }
          break;
        case "signedOut":
        case "signOut":
          // User signed out
          if (mounted) {
            setIsProcessing(false);
          }
          break;
        case "signIn_failure":
        case "signInWithRedirect_failure":
          // Sign in failed
          console.error("[Landing] Sign in failed:", payload.data);
          if (mounted) {
            setIsProcessing(false);
          }
          break;
      }
    });

    return () => {
      mounted = false;
      hubListener();
    };
  }, [router, searchParams]);

  const handleSignIn = async () => {
    try {
      setIsProcessing(true);
      await signInWithRedirect();
    } catch (error) {
      console.error("Sign-in error:", error);
      setIsProcessing(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-muted-foreground">Completing sign-in...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full">
      <Image
        src="/hero-bg.jpg"
        alt="AI Classroom"
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-bold text-sky-900">
              Welcome to PSD AI Studio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center mb-6 text-muted-foreground">
              Your creative space for building, exploring, and innovating with AI in education.
            </p>
            <Button
              onClick={handleSignIn}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white shadow-lg"
              size="lg"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-muted-foreground">Loading...</div>
        </div>
      </div>
    }>
      <LandingPageContent />
    </Suspense>
  );
}
