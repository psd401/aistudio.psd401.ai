import { SignIn } from '@clerk/nextjs';
import { Button, Container, Stack, Text, Title } from '@mantine/core';

export default function Home() {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" spacing="xl">
        <Title>Welcome to Enterprise App Template</Title>
        <Text>Please sign in to continue</Text>
        <SignIn />
      </Stack>
    </Container>
  );
}
