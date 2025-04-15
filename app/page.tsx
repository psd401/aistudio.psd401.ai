'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isSignedIn, isLoaded, router]);

  // Don't render anything while checking auth state
  if (!isLoaded || isSignedIn) {
    return null;
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
              asChild
              className="w-full bg-sky-600 hover:bg-sky-700 text-white shadow-lg"
              size="lg"
            >
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
