export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
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