import { SignIn } from '@clerk/nextjs';
import { Container, Stack, Title, Text } from '@mantine/core';

export default function SignInPage() {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" spacing="xl">
        <Title>Sign In</Title>
        <Text>Please sign in with your organization account</Text>
        <SignIn afterSignInUrl="/dashboard" signUpUrl="/sign-up" />
      </Stack>
    </Container>
  );
} 