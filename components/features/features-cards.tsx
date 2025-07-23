'use client';

import { IconBrain, IconShield, IconSpeedboat } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface FeatureProps {
  icon: React.FC<{ size?: number; className?: string; stroke?: number }>;
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
    title: 'AI-Powered Innovation',
    description:
      'A creative space for building and exploring AI applications, designed specifically for Peninsula School District educators and students.',
  },
  {
    icon: IconShield,
    title: 'Safe & Secure',
    description:
      'Built with education-first principles and stringent security measures to protect student and staff data while encouraging innovation.',
  },
  {
    icon: IconSpeedboat,
    title: 'Peninsula Pride',
    description:
      'A collaborative space that reflects our community values while pushing the boundaries of what\'s possible with AI in education.',
  },
];

export function FeaturesCards() {
  const items = features.map((item) => <Feature {...item} key={item.title} />);

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-center gap-8 mb-12">
        <div className="relative w-48 h-48 flex-shrink-0">
          <Image
            src="/psd-ai-logo.png"
            alt="PSD AI Logo"
            fill
            className="object-contain rounded-lg border-2 border-border/40 p-2 bg-card/50"
            priority
          />
        </div>
        <div className="text-left">
          <Badge variant="default" className="text-lg px-4 py-2">
            PENINSULA SCHOOL DISTRICT
          </Badge>
          <h1 className="text-5xl font-black mt-4">
            AI Studio
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-xl">
            A creative space for building, exploring, and innovating with artificial intelligence in education
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {items}
      </div>
    </div>
  );
} 