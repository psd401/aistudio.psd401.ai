'use client';

import { Button, Paper, Title } from '@mantine/core';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import classes from './page.module.css';

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
    <div className={classes.wrapper}>
      <Paper className={classes.form} radius={0} p={30}>
        <Title order={2} className={classes.title} ta="center" mt="md" mb={50}>
          Welcome to PSD AI Tools!
        </Title>

        <Button
          component={Link}
          href="/sign-in"
          fullWidth
          mt="xl"
          size="md"
        >
          Sign In
        </Button>
      </Paper>
    </div>
  );
}
