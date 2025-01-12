import { Button, Container, Stack, Text, Title } from '@mantine/core';
import Link from 'next/link';

export default function Home() {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" spacing="xl">
        <Title>Welcome to Enterprise App Template</Title>
        <Text>Please sign in to continue</Text>
        <Button component={Link} href="/sign-in">
          Sign In
        </Button>
      </Stack>
    </Container>
  );
}
