"use client"

import React from "react";
import { useUser } from "@/components/auth/user-provider";
import { useRouter } from "next/navigation";

interface WithRoleOptions {
  requiredRoles: string[];
  redirectTo?: string;
  fallback?: React.ReactNode;
}

/**
 * Higher-order component that checks if the user has any of the required roles.
 * If not, it either shows a fallback or redirects.
 */
export function withRole<P extends object>(
  Component: React.ComponentType<P>,
  options: WithRoleOptions
) {
  const WrappedComponent = (props: P) => {
    const { user, roles, loading } = useUser();
    const router = useRouter();

    React.useEffect(() => {
      if (!loading && !user && options.redirectTo) {
        router.push(options.redirectTo);
      }
    }, [loading, user, router]);

    if (loading) {
      return <div>Loading...</div>;
    }

    if (!user) {
      return options.fallback || null;
    }

    const userRoleNames = roles.map(r => r.name);
    const hasRequiredRole = options.requiredRoles.some(role => 
      userRoleNames.includes(role)
    );

    if (!hasRequiredRole) {
      if (options.redirectTo) {
        router.push(options.redirectTo);
        return null;
      }
      return options.fallback || <div>Unauthorized</div>;
    }

    return <Component {...props} />;
  };

  WrappedComponent.displayName = `withRole(${Component.displayName || Component.name || "Component"})`;
  
  return WrappedComponent;
} 