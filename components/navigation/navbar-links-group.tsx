'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface LinksGroupProps {
  icon: React.FC<any>;
  label: string;
  initiallyOpened?: boolean;
  links?: { label: string; link: string }[];
  link?: string;
}

export function LinksGroup({ icon: Icon, label, initiallyOpened, links, link }: LinksGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpened || false);
  const hasLinks = Array.isArray(links);

  const items = (hasLinks ? links : []).map((link) => (
    <Link
      href={link.link}
      key={link.label}
      className="block py-2 px-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {link.label}
    </Link>
  ));

  const ButtonContent = () => (
    <>
      <div className="flex items-center flex-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background">
          <Icon className="h-4 w-4" />
        </div>
        <span className="ml-3 text-sm font-medium">{label}</span>
      </div>
      {hasLinks && (
        <ChevronRight className={cn(
          "h-4 w-4 transition-transform duration-200",
          isOpen && "rotate-90"
        )} />
      )}
    </>
  );

  if (!hasLinks && link) {
    return (
      <Link href={link} passHref>
        <Button
          variant="ghost"
          className="w-full justify-start py-2 px-3 h-auto font-normal"
        >
          <ButtonContent />
        </Button>
      </Link>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="space-y-1"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start py-2 px-3 h-auto font-normal"
        >
          <ButtonContent />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1">
        {items}
      </CollapsibleContent>
    </Collapsible>
  );
} 