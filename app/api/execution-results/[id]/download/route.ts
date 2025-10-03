/* eslint-disable logging/require-request-id */
// Logging is handled in ./handler.ts
import { withRateLimit } from "@/lib/rate-limit"
import { downloadHandler } from "./handler"

// Export with rate limiting - download endpoints: 100 requests per minute (standard)
export const GET = withRateLimit(downloadHandler, {
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50 // 50 downloads per minute - reasonable for file downloads
})
