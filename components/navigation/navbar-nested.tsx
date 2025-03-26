'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import {
  IconHome,
  IconChalkboard,
  IconBuildingBank,
  IconBriefcase,
  IconShield,
  IconBulb,
  IconFlask,
  IconChartBar,
  IconBraces,
  IconFileAnalytics,
  IconMessageCircle,
  IconUsersGroup,
  IconUser,
  IconRobot,
  IconTools,
} from '@tabler/icons-react';
import { LinksGroup } from './navbar-links-group';
import { UserButton } from '../user/user-button';

/**
 * Map of icon names to components
 * Each icon name should correspond to a component from @tabler/icons-react
 * Used to render the correct icon in the navigation
 */
const iconMap: Record<string, React.FC<any>> = {
  IconHome,
  IconChalkboard,
  IconBuildingBank,
  IconBriefcase,
  IconShield,
  IconBulb,
  IconFlask,
  IconChartBar,
  IconBraces,
  IconFileAnalytics,
  IconMessageCircle,
  IconUsersGroup,
  IconUser,
  IconRobot,
  IconTools
};

/**
 * Raw navigation item from the API
 * Represents a single navigation item with its relationships
 */
interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  link: string | null;
  parent_id: string | null;
  parent_label: string | null;
  tool_id: string | null;
  position: number;
}

/**
 * Processed navigation item for the UI
 * Used by the LinksGroup component to render navigation items
 */
interface ProcessedItem {
  id: string;
  label: string;
  icon: string;
  link?: string;
  links?: { label: string; link: string }[];
}

/**
 * Main navigation component that displays both mobile and desktop navigation
 * Mobile navigation is displayed in a sheet, desktop in a sidebar
 */
export function NavbarNested() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile Navigation */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] p-0">
          <NavigationContent />
        </SheetContent>
      </Sheet>

      {/* Desktop Navigation */}
      <nav className="hidden lg:block h-screen w-[300px] border-r bg-background">
        <NavigationContent />
      </nav>
    </>
  );
}

/**
 * Renders the navigation content
 * - Fetches navigation items from API
 * - Processes items into a hierarchical structure
 * - Displays navigation items based on user permissions
 */
function NavigationContent() {
  const { user } = useUser();
  const [navItems, setNavItems] = useState<NavigationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);

  // Fetch navigation items from the API
  useEffect(() => {
    const fetchNavigation = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
        const navResponse = await fetch('/api/navigation');
        const navData = await navResponse.json();
        
        if (navData.isSuccess && Array.isArray(navData.data)) {
          setNavItems(navData.data);
        } else {
          console.error('Failed to fetch navigation:', navData.message);
          setNavItems([]);
        }
      } catch (error) {
        console.error('Failed to fetch navigation data:', error);
        setNavItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNavigation();
  }, [user?.id]);

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
        icon: section.icon,
      };
      
      // If section has a direct link, add it
      if (section.link) {
        processedSection.link = section.link;
      }
      
      // If section has children, add them as links
      if (children.length > 0) {
        processedSection.links = children.map(child => ({
          label: child.label,
          link: child.link || '#'
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
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b p-4">
        <Link href="/dashboard" className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="PSD401.AI"
            width={96}
            height={40}
            className="object-contain"
          />
        </Link>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-3 py-2">
            {isLoading ? (
              <div className="text-center py-4">Loading...</div>
            ) : (
              processedItems.map((item) => {
                const IconComponent = iconMap[item.icon] || IconHome;
                
                return (
                  <LinksGroup 
                    key={item.id}
                    label={item.label}
                    icon={IconComponent}
                    links={item.links}
                    link={item.link}
                  />
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="shrink-0 border-t p-4 bg-background">
        <UserButton />
      </div>
    </div>
  );
} 