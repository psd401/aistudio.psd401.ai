import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories } from "@/lib/error-utils"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { withRateLimit } from "@/lib/rate-limit"
import type { SqlParameter } from "@aws-sdk/client-rds-data"

interface ExecutionResultWithSchedule {
  id: number
  scheduledExecutionId: number
  resultData: Record<string, unknown>
  status: 'success' | 'failed' | 'running'
  executedAt: string
  executionDurationMs: number
  errorMessage: string | null
  scheduleName: string
  userId: number
  assistantArchitectName: string
  inputData: Record<string, unknown>
  scheduleConfig: Record<string, unknown>
}

async function downloadHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const timer = startTimer("GET /api/execution-results/[id]/download")
  const log = createLogger({ requestId, endpoint: "GET /api/execution-results/[id]/download" })

  try {
    const { id } = await params
    log.info("Downloading execution result", { resultId: sanitizeForLogging(id) })

    // Validate ID parameter
    const resultId = parseInt(id)
    if (isNaN(resultId) || resultId <= 0) {
      log.warn("Invalid result ID", { id })
      throw ErrorFactories.invalidInput("id", id, "must be a positive integer")
    }

    // Auth check
    const session = await getServerSession()
    if (!session?.sub) {
      log.warn("Unauthorized download attempt")
      throw ErrorFactories.authNoSession()
    }

    // Get user ID from database using cognito sub
    const userResult = await executeSQL(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [{ name: 'cognitoSub', value: { stringValue: session.sub } }])

    if (!userResult || userResult.length === 0) {
      throw ErrorFactories.dbRecordNotFound("users", session.sub)
    }

    const userId = Number(userResult[0].id)

    // Get execution result with all related data - includes access control check
    const sql = `
      SELECT
        er.id,
        er.scheduled_execution_id,
        er.result_data,
        er.status,
        er.executed_at,
        er.execution_duration_ms,
        er.error_message,
        se.name as schedule_name,
        se.user_id,
        se.input_data,
        se.schedule_config,
        aa.name as assistant_architect_name
      FROM execution_results er
      JOIN scheduled_executions se ON er.scheduled_execution_id = se.id
      JOIN assistant_architects aa ON se.assistant_architect_id = aa.id
      WHERE er.id = :result_id AND se.user_id = :user_id
    `

    const parameters: SqlParameter[] = [
      { name: 'result_id', value: { longValue: resultId } },
      { name: 'user_id', value: { longValue: userId } }
    ]

    const results = await executeSQL(sql, parameters)

    if (!results || results.length === 0) {
      log.warn("Execution result not found or access denied", { resultId, userId })
      return NextResponse.json(
        { error: "Execution result not found" },
        { status: 404 }
      )
    }

    // Transform the result
    const rawResult = transformSnakeToCamel<Record<string, unknown>>(results[0])

    const executionResult: ExecutionResultWithSchedule = {
      id: Number(rawResult.id),
      scheduledExecutionId: Number(rawResult.scheduledExecutionId),
      resultData: (() => {
        try {
          return typeof rawResult.resultData === 'string'
            ? JSON.parse(rawResult.resultData)
            : rawResult.resultData || {};
        } catch (error) {
          log.warn('Invalid JSON in resultData', {
            resultId: rawResult.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return {};
        }
      })(),
      status: String(rawResult.status) as 'success' | 'failed' | 'running',
      executedAt: String(rawResult.executedAt),
      executionDurationMs: Number(rawResult.executionDurationMs),
      errorMessage: rawResult.errorMessage ? String(rawResult.errorMessage) : null,
      scheduleName: String(rawResult.scheduleName),
      userId: Number(rawResult.userId),
      assistantArchitectName: String(rawResult.assistantArchitectName),
      inputData: (() => {
        try {
          return typeof rawResult.inputData === 'string'
            ? JSON.parse(rawResult.inputData)
            : rawResult.inputData || {};
        } catch (error) {
          log.warn('Invalid JSON in inputData', {
            resultId: rawResult.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return {};
        }
      })(),
      scheduleConfig: (() => {
        try {
          return typeof rawResult.scheduleConfig === 'string'
            ? JSON.parse(rawResult.scheduleConfig)
            : rawResult.scheduleConfig || {};
        } catch (error) {
          log.warn('Invalid JSON in scheduleConfig', {
            resultId: rawResult.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return {};
        }
      })()
    }

    // Generate markdown content
    const markdown = generateMarkdown(executionResult)

    // Generate filename
    const filename = generateFilename(executionResult)

    timer({ status: "success" })
    log.info("Execution result downloaded successfully", {
      resultId,
      filename,
      contentLength: markdown.length
    })

    // Return markdown file
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(markdown, 'utf8'))
      }
    })

  } catch (error) {
    timer({ status: "error" })
    log.error("Failed to download execution result", {
      error: error instanceof Error ? error.message : 'Unknown error',
      resultId: (await params).id
    })

    return NextResponse.json(
      handleError(error, "Failed to download execution result", {
        context: "GET /api/execution-results/[id]/download",
        requestId,
        operation: "downloadExecutionResult"
      }),
      { status: 500 }
    )
  }
}

function generateMarkdown(result: ExecutionResultWithSchedule): string {
  const executedDate = new Date(result.executedAt)
  const startTime = new Date(executedDate.getTime())
  const endTime = new Date(executedDate.getTime() + result.executionDurationMs)

  const statusEmoji = result.status === 'success' ? '✓' : result.status === 'failed' ? '✗' : '⏳'
  const duration = formatDuration(result.executionDurationMs)

  let markdown = `# ${result.scheduleName}
**Executed:** ${formatDateTime(executedDate)}
**Schedule:** ${getScheduleDescription(result.scheduleConfig)}
**Status:** ${result.status.charAt(0).toUpperCase() + result.status.slice(1)} ${statusEmoji}

`

  // Add input parameters if available
  if (result.inputData && Object.keys(result.inputData).length > 0) {
    markdown += `## Input Parameters
${formatInputData(result.inputData)}

`
  }

  // Add results section
  markdown += `## Results

`

  if (result.status === 'success' && result.resultData) {
    // Extract and format the main content
    if (typeof result.resultData === 'object' && result.resultData !== null) {
      if ('content' in result.resultData && typeof result.resultData.content === 'string') {
        markdown += result.resultData.content
      } else if ('text' in result.resultData && typeof result.resultData.text === 'string') {
        markdown += result.resultData.text
      } else if ('output' in result.resultData && typeof result.resultData.output === 'string') {
        markdown += result.resultData.output
      } else {
        // Fallback to JSON representation if no standard content field
        markdown += '```json\n' + JSON.stringify(result.resultData, null, 2) + '\n```'
      }
    } else {
      markdown += String(result.resultData)
    }
  } else if (result.status === 'failed' && result.errorMessage) {
    markdown += `**Error:** ${result.errorMessage}`
  } else if (result.status === 'running') {
    markdown += '**Status:** Execution is still in progress'
  } else {
    markdown += 'No result data available'
  }

  markdown += `

## Execution Details
- Started: ${formatDateTime(startTime)}
- Completed: ${formatDateTime(endTime)}
- Duration: ${duration}
- Assistant: ${result.assistantArchitectName}

---
Generated by AI Studio - Peninsula School District
View online: https://aistudio.psd401.ai/execution-results/${result.id}
`

  return markdown
}

function generateFilename(result: ExecutionResultWithSchedule): string {
  const executedDate = new Date(result.executedAt)
  const dateStr = executedDate.toISOString().slice(0, 10) // YYYY-MM-DD
  const timeStr = executedDate.toTimeString().slice(0, 5).replace(':', '') // HHMM

  // Sanitize schedule name for filename
  const safeName = result.scheduleName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50) // Limit length

  return `${safeName}-${dateStr}-${timeStr}.md`
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function getScheduleDescription(scheduleConfig: Record<string, unknown>): string {
  if (!scheduleConfig || typeof scheduleConfig !== 'object') {
    return 'Manual execution'
  }

  // Try to extract schedule description from config
  if ('description' in scheduleConfig && typeof scheduleConfig.description === 'string') {
    return scheduleConfig.description
  }

  if ('cron' in scheduleConfig && typeof scheduleConfig.cron === 'string') {
    return `Cron: ${scheduleConfig.cron}`
  }

  if ('frequency' in scheduleConfig && typeof scheduleConfig.frequency === 'string') {
    return `Frequency: ${scheduleConfig.frequency}`
  }

  return 'Scheduled execution'
}

function formatInputData(inputData: Record<string, unknown>): string {
  const entries = Object.entries(inputData)
  if (entries.length === 0) {
    return 'No input parameters'
  }

  return entries
    .map(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
      const formattedValue = typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value)
      return `- ${formattedKey}: ${formattedValue}`
    })
    .join('\n')
}

// Export with rate limiting - download endpoints: 100 requests per minute (standard)
export const GET = withRateLimit(downloadHandler, {
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50 // 50 downloads per minute - reasonable for file downloads
})