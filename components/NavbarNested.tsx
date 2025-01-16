'use client';

import { Group, ScrollArea, Image } from '@mantine/core';
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
import { LinksGroup } from './NavbarLinksGroup';
import { UserButton } from './UserButton';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import classes from './NavbarNested.module.css';

const getNavItems = (role?: string) => {
  const items = [
    { 
      label: 'Dashboard',
      icon: IconHome,
      link: '/dashboard'
    },
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
        { label: 'Scheduling', link: '/operational/scheduling' },
        { label: 'Resources', link: '/operational/resources' },
        { label: 'Process Management', link: '/operational/process' },
        { label: 'Analytics', link: '/operational/analytics' },
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
    },
    { 
      label: 'Settings', 
      icon: IconSettings,
      link: '/settings'
    },
  ];

  // Admin-only navigation items
  if (role?.toLowerCase() === 'administrator') {
    items.push({
      label: 'Admin',
      icon: IconShield,
      link: '/admin'
    });
  }

  return items;
};

export function NavbarNested() {
  const { user } = useUser();
  const role = user?.publicMetadata?.role as string;
  const links = getNavItems(role).map((item) => <LinksGroup {...item} key={item.label} />);

  return (
    <nav className={classes.navbar}>
      <div className={classes.header}>
        <div className={classes.logoContainer}>
          <Link href="/dashboard" className={classes.logoLink}>
            <Image
              src="/logo.png"
              alt="PSD401.AI"
              w={96}
              fit="contain"
            />
          </Link>
        </div>
      </div>

      <ScrollArea className={classes.links}>
        <div className={classes.linksInner}>{links}</div>
      </ScrollArea>

      <UserButton />
    </nav>
  );
} 