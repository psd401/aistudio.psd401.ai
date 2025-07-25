"use client"

import React, { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUserAction } from "@/actions/db/get-current-user-action";
import { SelectUser } from "@/types/db-types";
import { UserRole } from "@/types/auth-types";

interface UserContextValue {
  user: SelectUser | null;
  roles: UserRole[];
  loading: boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be within UserProvider");
  return ctx;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UserContextValue>({ user: null, roles: [], loading: true });

  useEffect(() => {
    getCurrentUserAction().then((res) => {
      if (res.isSuccess) {
        setState({ user: res.data.user, roles: res.data.roles as unknown as UserRole[], loading: false });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });
  }, []);

  return <UserContext.Provider value={state}>{children}</UserContext.Provider>;
} 