"use client"

import React, { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUserAction } from "@/actions/db/get-current-user-action";
import { SelectRole, SelectUser } from "@/types/db-types";

interface UserContextValue {
  user: SelectUser | null;
  roles: SelectRole[];
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
        setState({ user: res.data.user, roles: res.data.roles, loading: false });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });
  }, []);

  return <UserContext.Provider value={state}>{children}</UserContext.Provider>;
} 