"use client"

import { ReactNode } from "react";
import { UserProvider } from "@/components/auth/user-provider";

// Force dynamic rendering for all protected pages to avoid static generation issues with authentication
export const dynamic = 'force-dynamic'

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <UserProvider>{children}</UserProvider>;
} 