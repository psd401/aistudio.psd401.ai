import { createAuthHandlers } from "@/auth"

// Create handlers for each request
const handlers = createAuthHandlers()
export const { GET, POST } = handlers