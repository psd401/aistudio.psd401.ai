export interface User {
  id: number;
  clerkId: string;
  role: string;
  createdAt: string;
  // Clerk user data
  firstName?: string;
  lastName?: string;
  email?: string;
  lastSignInAt?: string;
} 