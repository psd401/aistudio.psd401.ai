'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import {
  IconHome,
  IconChalkboard,
  IconBuildingBank,
  IconBriefcase,
  IconSettings,
  IconShield,
  IconBulb,
  IconFlask,
} from '@tabler/icons-react';
import { LinksGroup } from './navbar-links-group';
import { UserButton } from '../user/user-button';

const getNavItems = (role?: string) => {
  const items = [
    { 
      label: 'Dashboard',
      icon: IconHome,
      link: '/dashboard'
    }
  ];

  // Staff and administrator sections
  if (role === 'staff' || role === 'administrator') {
    items.push(
      {
        label: 'Instructional',
        icon: IconChalkboard,
        links: [
          { label: 'Evaluation', link: '/instructional/evaluation' },
          { label: 'Lesson Planning', link: '/instructional/lesson-plan' },
          { label: 'Communication', link: '/instructional/communication' },
          { label: 'Curriculum', link: '/instructional/curriculum' },
          { label: 'Assessment', link: '/instructional/assessment' },
          { label: 'Resources', link: '/instructional/resources' },
        ],
      },
      {
        label: 'Operational',
        icon: IconBuildingBank,
        links: [
          { label: 'Communication Analysis', link: '/operations/communication-analysis' }
        ],
      },
      {
        label: 'Administrative',
        icon: IconBriefcase,
        links: [
          { label: 'Evaluation', link: '/administrative/evaluation' },
          { label: 'Planning', link: '/administrative/planning' },
          { label: 'Policy', link: '/administrative/policy' },
          { label: 'Performance', link: '/administrative/performance' },
          { label: 'Compliance', link: '/administrative/compliance' },
        ],
      },
      {
        label: 'Experiments',
        icon: IconFlask,
        links: [
          { label: 'Chat', link: '/chat' },
        ],
      },
      { 
        label: 'Ideas', 
        icon: IconBulb,
        link: '/ideas'
      }
    );
  }

  // Common sections for all users
  items.push({ 
    label: 'Settings', 
    icon: IconSettings,
    link: '/settings'
  });

  // Administrator-only section
  if (role === 'administrator') {
    items.push({
      label: 'Admin',
      icon: IconShield,
      link: '/admin'
    });
  }

  return items;
};

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

function NavigationContent() {
  const { user } = useUser();
  const [role, setRole] = useState<string>();

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const response = await fetch('/api/auth/check-role');
        const { isSuccess, role } = await response.json();
        if (isSuccess) {
          setRole(role);
        }
      } catch (error) {
        console.error('Failed to fetch role:', error);
      }
    };

    if (user?.id) {
      fetchRole();
    }
  }, [user?.id]);

  const links = getNavItems(role).map((item) => <LinksGroup {...item} key={item.label} />);

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b p-4">
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

      <ScrollArea className="flex-1 px-3">
        <div className="py-2">{links}</div>
      </ScrollArea>

      <Separator />
      <div className="p-4">
        <UserButton />
      </div>
    </div>
  );
} 