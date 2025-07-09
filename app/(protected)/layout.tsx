"use client"

import { ReactNode } from "react";
import { UserProvider } from "@/components/auth/user-provider";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <UserProvider>{children}</UserProvider>;
} 