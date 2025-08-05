import { createLogger, generateRequestId, startTimer } from "@/lib/logger"

export async function GET() {
  const requestId = generateRequestId()
  const timer = startTimer("api.ping")
  const log = createLogger({ requestId, route: "api.ping" })
  
  log.debug("Ping request received")
  
  timer({ status: "success" })
  
  return new Response("pong", { 
    status: 200,
    headers: { 
      "Content-Type": "text/plain",
      "X-Request-Id": requestId
    }
  });
}