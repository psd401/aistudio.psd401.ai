export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string; // Legacy single role for backward compatibility
  roles?: string[]; // Multiple roles support
  lastSignInAt?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
}

export interface UserWithRoles {
  user: User;
  roles: Role[];
} 