import { NextRequest, NextResponse } from "next/server"
import { getSchedulesAction, createScheduleAction } from "@/actions/db/schedule-actions"
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/lib/db/data-api-adapter"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger'
export const dynamic = 'force-dynamic'

/**
 * GET /api/schedules - List user schedules
 */
export async function GET() {
  const requestId = generateRequestId()
  const timer = startTimer("api.schedules.list")
  const log = createLogger({ requestId, route: "api.schedules" })

  log.info("GET /api/schedules - Fetching user schedules")

  try {
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized - No session or sub")
      timer({ status: "error", reason: "unauthorized" })
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401, headers: { "X-Request-Id": requestId } }
      )
    }

    // Check if user has access to the assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("Forbidden - User lacks assistant-architect access")
      timer({ status: "error", reason: "forbidden" })
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden" },
        { status: 403, headers: { "X-Request-Id": requestId } }
      )
    }

    // Note: Rate limiting handled by middleware if enabled

    const result = await getSchedulesAction()

    if (!result.isSuccess) {
      log.warn("Failed to get schedules", { message: result.message })
      timer({ status: "error", reason: "fetch_failed" })
      return NextResponse.json(result, {
        status: 400,
        headers: { "X-Request-Id": requestId }
      })
    }

    log.info("Schedules fetched successfully", { count: result.data?.length || 0 })
    timer({ status: "success", count: result.data?.length || 0 })

    return NextResponse.json(result.data, {
      headers: { "X-Request-Id": requestId }
    })
  } catch (error) {
    timer({ status: "error" })
    log.error("Error in schedules API", error)
    return NextResponse.json(
      {
        isSuccess: false,
        message: "Failed to fetch schedules"
      },
      { status: 500, headers: { "X-Request-Id": requestId } }
    )
  }
}

/**
 * POST /api/schedules - Create new schedule
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timer = startTimer("api.schedules.create")
  const log = createLogger({ requestId, route: "api.schedules" })

  log.info("POST /api/schedules - Creating new schedule")

  try {
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized - No session or sub")
      timer({ status: "error", reason: "unauthorized" })
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401, headers: { "X-Request-Id": requestId } }
      )
    }

    // Check if user has access to the assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("Forbidden - User lacks assistant-architect access")
      timer({ status: "error", reason: "forbidden" })
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden" },
        { status: 403, headers: { "X-Request-Id": requestId } }
      )
    }

    // Note: Rate limiting handled by middleware if enabled

    // Parse request body
    let body
    try {
      body = await request.json()
      log.info("Request body parsed successfully", {
        bodyType: typeof body,
        bodyKeys: body ? Object.keys(body) : 'null',
        bodyContent: sanitizeForLogging(body)
      })
    } catch (error) {
      log.warn("Invalid JSON in request body", { error: sanitizeForLogging(error) })
      timer({ status: "error", reason: "invalid_json" })
      return NextResponse.json(
        { isSuccess: false, message: "Invalid JSON in request body" },
        { status: 400, headers: { "X-Request-Id": requestId } }
      )
    }

    // Validate required fields
    const { name, assistantArchitectId, scheduleConfig, inputData } = body

    log.info("Extracted fields from request body", {
      name: name ? 'present' : 'missing',
      nameType: typeof name,
      assistantArchitectId: assistantArchitectId ? 'present' : 'missing',
      assistantArchitectIdType: typeof assistantArchitectId,
      assistantArchitectIdValue: assistantArchitectId,
      scheduleConfig: scheduleConfig ? 'present' : 'missing',
      scheduleConfigType: typeof scheduleConfig,
      inputData: inputData ? 'present' : 'missing',
      inputDataType: typeof inputData
    })

    if (!name || !assistantArchitectId || !scheduleConfig || !inputData) {
      log.warn("Missing required fields", {
        nameCheck: !!name,
        assistantArchitectIdCheck: !!assistantArchitectId,
        scheduleConfigCheck: !!scheduleConfig,
        inputDataCheck: !!inputData
      })
      timer({ status: "error", reason: "missing_fields" })
      return NextResponse.json(
        { isSuccess: false, message: "Missing required fields: name, assistantArchitectId, scheduleConfig, inputData" },
        { status: 400, headers: { "X-Request-Id": requestId } }
      )
    }

    log.info("About to call createScheduleAction", {
      paramsToPass: {
        name,
        assistantArchitectId,
        scheduleConfig: sanitizeForLogging(scheduleConfig),
        inputData: typeof inputData
      }
    })

    const result = await createScheduleAction({
      name,
      assistantArchitectId,
      scheduleConfig,
      inputData
    })

    log.info("createScheduleAction completed", {
      isSuccess: result.isSuccess,
      hasMessage: !!result.message
    })

    if (!result.isSuccess) {
      log.warn("Failed to create schedule", { message: result.message })
      timer({ status: "error", reason: "create_failed" })

      // Return appropriate status code based on error type
      let statusCode = 400
      if (result.message.includes("Unauthorized") || result.message.includes("not found")) {
        statusCode = 401
      } else if (result.message.includes("Forbidden") || result.message.includes("access")) {
        statusCode = 403
      } else if (result.message.includes("Maximum")) {
        statusCode = 429
      }

      return NextResponse.json(result, {
        status: statusCode,
        headers: { "X-Request-Id": requestId }
      })
    }

    log.info("Schedule created successfully")
    timer({ status: "success" })

    return NextResponse.json(result, {
      status: 201,
      headers: { "X-Request-Id": requestId }
    })
  } catch (error) {
    timer({ status: "error" })
    log.error("Unexpected error in create schedule API", {
      error: sanitizeForLogging(error),
      errorType: typeof error,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'unknown',
      errorStack: error instanceof Error ? error.stack : 'unknown'
    })
    return NextResponse.json(
      {
        isSuccess: false,
        message: "Internal server error occurred"
      },
      { status: 500, headers: { "X-Request-Id": requestId } }
    )
  }
}