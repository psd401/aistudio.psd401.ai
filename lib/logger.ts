// Winston logger utility for structured, environment-aware logging
// - Development: pretty, colorized logs to console
// - Production: JSON logs to stdout/stderr (CloudWatch picks up in AWS)
// Usage: import logger, { withRequestId } from "@/lib/logger"

import winston, { Logger } from "winston"

const isProd = process.env.NODE_ENV === "production"

const logger: Logger = winston.createLogger({
  level: isProd ? "info" : "debug",
  format: isProd
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
          return `${timestamp} ${level}: ${message} ${metaString}`
        })
      ),
  transports: [new winston.transports.Console()],
})

// Helper to create a child logger with context (e.g., requestId)
export function withRequestId(requestId: string) {
  return logger.child({ requestId })
}

export default logger 