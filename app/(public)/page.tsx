"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { signInWithRedirect } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Hub } from "aws-amplify/utils";

export default function LandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Check if we have OAuth callback parameters
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (code && state) {
      // We have OAuth callback parameters, Amplify will handle them automatically
      setIsProcessing(true);
      
      // Listen for successful sign-in
      const hubListener = Hub.listen("auth", ({ payload }) => {
        if (payload.event === "signedIn") {
          // Redirect to dashboard after successful sign-in
          router.push("/dashboard");
        }
      });
      
      return () => {
        hubListener();
      };
    } else {
      // No OAuth parameters, check if user is already signed in
      getCurrentUser()
        .then(() => {
          // User is signed in, redirect to dashboard
          router.push("/dashboard");
        })
        .catch(() => {
          // User is not signed in, stay on landing page
        });
    }
  }, [router, searchParams]);

  const handleSignIn = async () => {
    try {
      await signInWithRedirect();
    } catch (error) {
      console.error("Sign-in error:", error);
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
