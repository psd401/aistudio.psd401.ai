// NextAuth routes handle their own logging internally
// These are auto-generated handlers from the NextAuth library
import { createAuthHandlers } from "@/auth"

// Create handlers for each request
const handlers = createAuthHandlers()
export const { GET, POST } = handlers