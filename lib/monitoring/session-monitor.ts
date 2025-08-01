import logger from "@/lib/logger";

export function logSessionAccess(userId: string, requestId: string) {
  // Log to CloudWatch
  logger.info("Session accessed", {
    userId,
    requestId,
    timestamp: new Date().toISOString(),
  });
}

export function detectSessionAnomaly(session: { user: { id: string } }, expectedUserId: string) {
  if (session.user.id !== expectedUserId) {
    logger.error("SESSION ANOMALY DETECTED", {
      expected: expectedUserId,
      actual: session.user.id,
      timestamp: new Date().toISOString(),
    });
    // Trigger alert - in production this would send to monitoring system
  }
}