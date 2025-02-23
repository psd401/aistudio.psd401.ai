import { Role } from "@/types"

export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Role;
    }
  }
} 