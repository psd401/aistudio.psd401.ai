import { Role } from '~/lib/schema';

export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Role;
    }
  }
} 