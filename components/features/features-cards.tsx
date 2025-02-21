'use client';

import { IconBrain, IconShield, IconSpeedboat } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FeatureProps {
  icon: React.FC<any>;
  title: string;
  description: string;
}

function Feature({ icon: Icon, title, description }: FeatureProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute h-24 w-40 top-0 left-0 bg-blue-100/20 rounded-br-[60%] rounded-tl-lg" />
      <CardHeader>
        <Icon size={38} className="text-blue-600 mb-2" stroke={1.5} />
        <CardTitle className="text-lg font-bold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </CardContent>
    </Card>
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
    <div className="container mx-auto py-8">
      <div className="text-center mb-12">
        <Badge variant="default" className="text-lg px-4 py-2">
          PENINSULA SCHOOL DISTRICT
        </Badge>
        <h1 className="text-5xl font-black mt-4">
          AI Tools for Education
        </h1>
        <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
          Empowering teachers and students with custom-built artificial intelligence solutions
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {items}
      </div>
    </div>
  );
} 