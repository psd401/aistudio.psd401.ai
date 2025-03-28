'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { iconMap, IconName } from './icon-map';

interface NavigationLink {
  label: string;
  link: string;
  description?: string;
  icon?: IconName;
}

interface LinksGroupProps {
  icon: React.FC<any>;
  label: string;
  type?: 'link' | 'section' | 'page';
  links?: NavigationLink[];
  link?: string;
}

export function LinksGroup({ icon: Icon, label, type = 'link', links, link }: LinksGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Determine if this is a dropdown (has child links) or a direct link
  const hasLinks = Array.isArray(links) && links.length > 0;
  const isDirectLink = !!link && !hasLinks;
  const isPage = type === 'page';

  // Create the list of child links
  const items = (hasLinks ? links : []).map((link) => {
    const LinkIcon = link.icon ? iconMap[link.icon] : null;
    
    if (isPage) {
      return (
        <Link
          href={link.link}
          key={link.label}
          className="block p-4 rounded-lg border bg-card text-card-foreground hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            {LinkIcon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background">
                <LinkIcon className="h-4 w-4" />
              </div>
            )}
            <span className="font-medium">{link.label}</span>
          </div>
          {link.description && (
            <p className="text-sm text-muted-foreground">{link.description}</p>
          )}
        </Link>
      );
    }

    return (
      <Link
        href={link.link}
        key={link.label}
        className="block py-2 px-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {link.label}
      </Link>
    );
  });

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
      <CollapsibleContent className={cn(
        "space-y-1",
        isPage && "grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 py-2"
      )}>
        {items}
      </CollapsibleContent>
    </Collapsible>
  );
} 