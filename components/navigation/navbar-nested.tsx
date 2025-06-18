'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getCurrentUser } from 'aws-amplify/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { iconMap, IconName } from './icon-map';
import { LinksGroup } from './navbar-links-group';
import { UserButton } from '../user/user-button';
import { cn } from '@/lib/utils';

/**
 * Raw navigation item from the API
 * Represents a single navigation item with its relationships
 */
interface NavigationItem {
  id: string;
  label: string;
  icon: IconName;
  link: string | null;
  description?: string;
  type: 'link' | 'section' | 'page';
  parent_id: string | null;
  parent_label: string | null;
  tool_id: string | null;
  position: number;
  color?: string;
}

/**
 * Processed navigation item for the UI
 * Used by the LinksGroup component to render navigation items
 */
interface ProcessedItem {
  id: string;
  label: string;
  icon: IconName;
  type: 'link' | 'section' | 'page';
  link?: string;
  links?: {
    label: string;
    link: string;
    description?: string;
    icon?: IconName;
    color?: string;
  }[];
  color?: string;
}

// Variants for sidebar animation
const sidebarVariants = {
  expanded: { width: '300px' },
  collapsed: { width: '68px' },
};

const logoTextVariants = {
  expanded: { opacity: 1, x: 0, transition: { delay: 0.2 } },
  collapsed: { opacity: 0, x: -10 },
}

/**
 * Main collapsible navigation sidebar for desktop.
 */
export function NavbarNested() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.nav
      initial={false}
      animate={isExpanded ? 'expanded' : 'collapsed'}
      variants={sidebarVariants}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'hidden lg:flex flex-col h-[calc(100dvh-3.5rem)] border-r bg-background fixed top-14 left-0',
        'z-40'
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <NavigationContent isExpanded={isExpanded} />
    </motion.nav>
  );
}

/**
 * Renders the navigation content (logo, links, user button).
 * Accepts isExpanded prop to adjust layout.
 */
function NavigationContent({ isExpanded }: { isExpanded: boolean }) {
  const [navItems, setNavItems] = useState<NavigationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);

  // Fetch navigation items from the API
  useEffect(() => {
    const fetchNavigation = async () => {
      try {
        setIsLoading(true);
        const navResponse = await fetch('/api/navigation');
        const navData = await navResponse.json();
        if (navData.isSuccess && Array.isArray(navData.data)) {
          setNavItems(navData.data);
        } else {
          console.error('Failed to fetch navigation', navData.message);
          setNavItems([]);
        }
      } catch (error) {
        console.error('Failed to fetch navigation data', error);
        setNavItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNavigation();
  }, []);

  // Process navigation items into proper structure for the UI
  useEffect(() => {
    if (navItems.length === 0) {
      setProcessedItems([]);
      return;
    }

    // Find all top-level items (sections)
    const topLevelItems = navItems.filter(item => item.parent_id === null);
    
    // Create a processed structure for each top-level item
    const processed = topLevelItems.map(section => {
      // Find children for this section
      const children = navItems.filter(item => item.parent_id === section.id);
      
      const processedSection: ProcessedItem = {
        id: section.id,
        label: section.label,
        icon: section.icon as IconName,
        type: section.type,
        color: section.color
      };
      
      // If section has a direct link, add it
      if (section.type === 'page') {
        processedSection.link = section.link || `/page/${section.id}`;
      } else if (section.link) {
        processedSection.link = section.link;
      }
      
      // If section has children, add them as links
      if (children.length > 0) {
        processedSection.links = children.map(child => ({
          label: child.label,
          link: child.type === 'page' ? (child.link || `/page/${child.id}`) : (child.link || '#'),
          description: child.description,
          icon: child.icon as IconName,
          color: child.color
        }));
      }
      
      return processedSection;
    });
    
    // Sort by position
    processed.sort((a, b) => {
      const aItem = topLevelItems.find(item => item.id === a.id);
      const bItem = topLevelItems.find(item => item.id === b.id);
      return (aItem?.position || 0) - (bItem?.position || 0);
    });
    
    setProcessedItems(processed);
  }, [navItems]);

  return (
    <>
      {/* Navigation Links Container */}
      <div className="flex-1 flex flex-col h-full">
        <ScrollArea className="flex-1">
          <div className={cn(
            "py-4",
            isExpanded ? "px-3" : "px-2"
          )}>
            {isLoading ? (
              <div className="text-center py-4">Loading...</div>
            ) : (
              <div className="space-y-2">
                {processedItems.map((item) => (
                  <LinksGroup
                    key={item.id}
                    isExpanded={isExpanded}
                    {...item}
                    icon={iconMap[item.icon] || iconMap.IconHome}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
} 