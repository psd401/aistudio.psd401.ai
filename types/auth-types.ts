export interface UserRole {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  cognitoSub: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithRoles {
  user: AuthUser;
  roles: UserRole[];
}

export const ROLE_NAMES = {
  ADMIN: "admin",
  STAFF: "staff", 
  STUDENT: "student",
} as const;

export type RoleName = typeof ROLE_NAMES[keyof typeof ROLE_NAMES]; 