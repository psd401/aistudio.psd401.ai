'use client';

import { IconBrain, IconShield, IconSpeedboat } from '@tabler/icons-react';
import { Container, SimpleGrid, Text, Badge } from '@mantine/core';
import classes from './FeaturesCards.module.css';

interface FeatureProps extends React.ComponentPropsWithoutRef<'div'> {
  icon: React.FC<any>;
  title: string;
  description: string;
}

function Feature({ icon: Icon, title, description, className, ...others }: FeatureProps) {
  return (
    <div className={classes.feature} {...others}>
      <div className={classes.overlay} />
      <div className={classes.content}>
        <Icon size={38} className={classes.icon} stroke={1.5} />
        <Text fw={700} fz="lg" className={classes.title}>
          {title}
        </Text>
        <Text c="dimmed" fz="sm" className={classes.description}>
          {description}
        </Text>
      </div>
    </div>
  );
}

const features = [
  {
    icon: IconBrain,
    title: 'AI-Powered Learning',
    description:
      'Custom-built AI tools designed specifically for Peninsula School District, enhancing both teaching and learning experiences.',
  },
  {
    icon: IconShield,
    title: 'Safe & Secure',
    description:
      'Built with education-first principles and stringent security measures to protect student and staff data.',
  },
  {
    icon: IconSpeedboat,
    title: 'Peninsula Pride',
    description:
      'Tailored specifically for PSD, these tools reflect our community values and educational goals.',
  },
];

export function FeaturesCards() {
  const items = features.map((item) => <Feature {...item} key={item.title} />);

  return (
    <Container mt={30} mb={30} size="lg">
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <Badge variant="filled" size="lg">
          PENINSULA SCHOOL DISTRICT
        </Badge>
        <Text fz="3rem" fw={900} style={{ marginTop: '1rem' }}>
          AI Tools for Education
        </Text>
        <Text c="dimmed" size="lg" maw={600} mx="auto" mt="1rem">
          Empowering teachers and students with custom-built artificial intelligence solutions
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={50}>
        {items}
      </SimpleGrid>
    </Container>
  );
} 