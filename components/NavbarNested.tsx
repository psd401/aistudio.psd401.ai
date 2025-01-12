'use client';

import { Group, ScrollArea, Image } from '@mantine/core';
import {
  IconHome,
  IconMessage,
  IconChalkboard,
  IconBuildingBank,
  IconBriefcase,
  IconSettings,
  IconShield,
  IconRobot,
  IconBulb,
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
      label: 'Chat',
      icon: IconMessage,
      link: '/chat'
    },
    {
      label: 'Teacher Assistants',
      icon: IconChalkboard,
      links: [
        { label: 'Evaluation Assistant', link: '/teacher-assistants/evaluation' },
        { label: 'Lesson Plan Assistant', link: '/teacher-assistants/lesson-plan' },
        { label: 'Communication Assistant', link: '/teacher-assistants/communication' },
      ],
    },
    {
      label: 'Teacher Agents',
      icon: IconRobot,
      links: [
        { label: 'Curriculum Agent', link: '/teacher-agents/curriculum' },
        { label: 'Assessment Agent', link: '/teacher-agents/assessment' },
        { label: 'Resource Agent', link: '/teacher-agents/resources' },
      ],
    },
    {
      label: 'Operational Assistants',
      icon: IconBuildingBank,
      links: [
        { label: 'Scheduling Assistant', link: '/operational-assistants/scheduling' },
        { label: 'Resource Assistant', link: '/operational-assistants/resources' },
      ],
    },
    {
      label: 'Operational Agents',
      icon: IconRobot,
      links: [
        { label: 'Process Agent', link: '/operational-agents/process' },
        { label: 'Analytics Agent', link: '/operational-agents/analytics' },
      ],
    },
    {
      label: 'Administrative Assistants',
      icon: IconBriefcase,
      links: [
        { label: 'Evaluation Assistant', link: '/administrative-assistants/evaluation' },
        { label: 'Lesson Plan Assistant', link: '/administrative-assistants/lesson-plan' },
        { label: 'Policy Assistant', link: '/administrative-assistants/policy' },
      ],
    },
    {
      label: 'Administrative Agents',
      icon: IconRobot,
      links: [
        { label: 'Performance Agent', link: '/administrative-agents/performance' },
        { label: 'Compliance Agent', link: '/administrative-agents/compliance' },
        { label: 'Planning Agent', link: '/administrative-agents/planning' },
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
  if (role?.toLowerCase() === 'admin') {
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