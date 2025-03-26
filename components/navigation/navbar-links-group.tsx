'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

/**
 * Props for the LinksGroup component
 * 
 * @property icon - The icon component to display
 * @property label - The text to display for the group
 * @property initiallyOpened - Whether the group should be initially expanded
 * @property links - Array of child links (for dropdown sections)
 * @property link - Direct link (for non-dropdown items)
 */
interface LinksGroupProps {
  icon: React.FC<any>;
  label: string;
  initiallyOpened?: boolean;
  links?: { label: string; link: string }[];
  link?: string;
}

/**
 * Navigation Links Group Component
 * 
 * Renders either:
 * 1. A collapsible dropdown with child links (when links array is provided)
 * 2. A direct navigation link (when link is provided and no links array)
 * 
 * Used to build the navigation sidebar structure
 */
export function LinksGroup({ icon: Icon, label, initiallyOpened, links, link }: LinksGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpened || false);
  
  // Determine if this is a dropdown (has child links) or a direct link
  const hasLinks = Array.isArray(links) && links.length > 0;
  const isDirectLink = !!link && !hasLinks;

  // Create the list of child links
  const items = (hasLinks ? links : []).map((link) => (
    <Link
      href={link.link}
      key={link.label}
      className="block py-2 px-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {link.label}
    </Link>
  ));

  // Common button content for both direct links and dropdown triggers
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

  // If it's a direct link (no dropdown)
  if (isDirectLink) {
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

  // If it's a dropdown with links
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