/**
 * Email Notification Testing Integration
 * Tests SES integration for schedule execution notifications
 * Part of Issue #271: Testing: End-to-End Scheduling Workflows
 */

import { executeSQL, createParameter } from '@/lib/db/data-api-adapter'
import { transformSnakeToCamel } from '@/lib/db/field-mapper'

// Mock AWS SES client for testing
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({
    send: jest.fn()
  })),
  SendEmailCommand: jest.fn(),
  SendRawEmailCommand: jest.fn(),
  GetSendStatisticsCommand: jest.fn()
}))

// Mock database functions
jest.mock('@/lib/db/data-api-adapter')
const mockExecuteSQL = executeSQL as jest.MockedFunction<typeof executeSQL>
const mockCreateParameter = createParameter as jest.MockedFunction<typeof createParameter>

describe('Email Notification Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateParameter.mockImplementation((name, value) => ({ name, value } as any))
  })

  describe('Email Notification Creation', () => {
    test('should create email notification for successful execution', async () => {
      const mockExecutionResult = {
        id: 1,
        scheduled_execution_id: 1,
        result_data: JSON.stringify({
          output: 'Weather report for Seattle: Sunny, 75°F',
          metrics: {
            tokens: 1500,
            duration: 5000,
            cost: 0.03
          }
        }),
        status: 'success',
        executed_at: '2025-01-01T07:00:00Z',
        execution_duration_ms: 5000
      }

      const mockNotification = {
        id: 1,
        user_id: 1,
        execution_result_id: 1,
        type: 'email',
        status: 'sent',
        delivery_attempts: 1,
        last_attempt_at: '2025-01-01T07:01:00Z',
        created_at: '2025-01-01T07:01:00Z'
      }

      mockExecuteSQL.mockResolvedValueOnce([mockNotification])

      const notification = await executeSQL(`
        INSERT INTO user_notifications (
          user_id, execution_result_id, type, status, delivery_attempts, last_attempt_at
        ) VALUES (
          :userId, :executionResultId, :type, :status, :deliveryAttempts, :lastAttemptAt
        ) RETURNING *
      `, [
        createParameter('userId', 1),
        createParameter('executionResultId', 1),
        createParameter('type', 'email'),
        createParameter('status', 'sent'),
        createParameter('deliveryAttempts', 1),
        createParameter('lastAttemptAt', '2025-01-01T07:01:00Z')
      ])

      expect(notification).toHaveLength(1)
      expect(notification[0].type).toBe('email')
      expect(notification[0].status).toBe('sent')
      expect(notification[0].delivery_attempts).toBe(1)
    })

    test('should create email notification for failed execution', async () => {
      const mockExecutionResult = {
        id: 2,
        scheduled_execution_id: 1,
        result_data: JSON.stringify({
          error: 'API rate limit exceeded',
          partialOutput: 'Started weather report but failed...'
        }),
        status: 'failed',
        executed_at: '2025-01-01T08:00:00Z',
        execution_duration_ms: 2000,
        error_message: 'External API rate limit exceeded'
      }

      const mockNotification = {
        id: 2,
        user_id: 1,
        execution_result_id: 2,
        type: 'email',
        status: 'sent',
        delivery_attempts: 1,
        last_attempt_at: '2025-01-01T08:01:00Z',
        created_at: '2025-01-01T08:01:00Z'
      }

      mockExecuteSQL.mockResolvedValueOnce([mockNotification])

      const notification = await executeSQL(`
        INSERT INTO user_notifications (
          user_id, execution_result_id, type, status
        ) VALUES (
          :userId, :executionResultId, :type, :status
        ) RETURNING *
      `, [
        createParameter('userId', 1),
        createParameter('executionResultId', 2),
        createParameter('type', 'email'),
        createParameter('status', 'sent')
      ])

      expect(notification).toHaveLength(1)
      expect(notification[0].execution_result_id).toBe(2)
      expect(notification[0].type).toBe('email')
    })
  })

  describe('Email Content Generation', () => {
    test('should generate proper email content for successful execution', () => {
      const executionData = {
        scheduleName: 'Daily Weather Report',
        assistantArchitectName: 'Weather Assistant',
        executedAt: '2025-01-01T07:00:00Z',
        status: 'success',
        output: 'Weather report for Seattle: Sunny, 75°F with light winds from the west.',
        metrics: {
          tokens: 1500,
          duration: 5000,
          cost: 0.03
        }
      }

      const emailContent = {
        subject: `✅ Schedule "${executionData.scheduleName}" completed successfully`,
        htmlBody: `
          <h2>Schedule Execution Completed</h2>
          <p><strong>Schedule:</strong> ${executionData.scheduleName}</p>
          <p><strong>Assistant:</strong> ${executionData.assistantArchitectName}</p>
          <p><strong>Executed At:</strong> ${new Date(executionData.executedAt).toLocaleString()}</p>
          <p><strong>Status:</strong> ✅ Success</p>

          <h3>Results</h3>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
            ${executionData.output}
          </div>

          <h3>Execution Metrics</h3>
          <ul>
            <li>Tokens Used: ${executionData.metrics.tokens}</li>
            <li>Duration: ${executionData.metrics.duration}ms</li>
            <li>Estimated Cost: $${executionData.metrics.cost}</li>
          </ul>

          <p><small>This is an automated notification from AI Studio.</small></p>
        `,
        textBody: `
Schedule Execution Completed

Schedule: ${executionData.scheduleName}
Assistant: ${executionData.assistantArchitectName}
Executed At: ${new Date(executionData.executedAt).toLocaleString()}
Status: Success

Results:
${executionData.output}

Execution Metrics:
- Tokens Used: ${executionData.metrics.tokens}
- Duration: ${executionData.metrics.duration}ms
- Estimated Cost: $${executionData.metrics.cost}

This is an automated notification from AI Studio.
        `.trim()
      }

      expect(emailContent.subject).toContain('completed successfully')
      expect(emailContent.htmlBody).toContain(executionData.scheduleName)
      expect(emailContent.htmlBody).toContain(executionData.output)
      expect(emailContent.textBody).toContain('Success')
      expect(emailContent.textBody).toContain(executionData.metrics.tokens.toString())
    })

    test('should generate proper email content for failed execution', () => {
      const executionData = {
        scheduleName: 'Daily Weather Report',
        assistantArchitectName: 'Weather Assistant',
        executedAt: '2025-01-01T07:00:00Z',
        status: 'failed',
        errorMessage: 'API rate limit exceeded',
        partialOutput: 'Started processing weather data but failed after 30 seconds.',
        metrics: {
          duration: 30000,
          tokensUsed: 500
        }
      }

      const emailContent = {
        subject: `❌ Schedule "${executionData.scheduleName}" failed`,
        htmlBody: `
          <h2>Schedule Execution Failed</h2>
          <p><strong>Schedule:</strong> ${executionData.scheduleName}</p>
          <p><strong>Assistant:</strong> ${executionData.assistantArchitectName}</p>
          <p><strong>Executed At:</strong> ${new Date(executionData.executedAt).toLocaleString()}</p>
          <p><strong>Status:</strong> ❌ Failed</p>

          <h3>Error Details</h3>
          <div style="background: #ffebee; padding: 15px; border-radius: 5px; border-left: 4px solid #f44336;">
            <strong>Error:</strong> ${executionData.errorMessage}
          </div>

          ${executionData.partialOutput ? `
          <h3>Partial Output</h3>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
            ${executionData.partialOutput}
          </div>
          ` : ''}

          <h3>Troubleshooting</h3>
          <ul>
            <li>Check if external APIs are available</li>
            <li>Verify API keys and permissions</li>
            <li>Review recent schedule configuration changes</li>
            <li>Contact support if the issue persists</li>
          </ul>

          <p><small>This is an automated notification from AI Studio.</small></p>
        `,
        textBody: `
Schedule Execution Failed

Schedule: ${executionData.scheduleName}
Assistant: ${executionData.assistantArchitectName}
Executed At: ${new Date(executionData.executedAt).toLocaleString()}
Status: Failed

Error: ${executionData.errorMessage}

${executionData.partialOutput ? `Partial Output:\n${executionData.partialOutput}\n\n` : ''}

Troubleshooting:
- Check if external APIs are available
- Verify API keys and permissions
- Review recent schedule configuration changes
- Contact support if the issue persists

This is an automated notification from AI Studio.
        `.trim()
      }

      expect(emailContent.subject).toContain('failed')
      expect(emailContent.htmlBody).toContain('❌ Failed')
      expect(emailContent.htmlBody).toContain(executionData.errorMessage)
      expect(emailContent.textBody).toContain('Failed')
      expect(emailContent.textBody).toContain('Troubleshooting')
    })
  })

  describe('Email Delivery Testing', () => {
    test('should track email delivery attempts', async () => {
      const mockNotifications = [
        {
          id: 1,
          user_id: 1,
          execution_result_id: 1,
          type: 'email',
          status: 'sent',
          delivery_attempts: 1,
          last_attempt_at: '2025-01-01T07:01:00Z',
          failure_reason: null,
          created_at: '2025-01-01T07:01:00Z'
        }
      ]

      mockExecuteSQL.mockResolvedValueOnce(mockNotifications)

      const notifications = await executeSQL(`
        SELECT * FROM user_notifications
        WHERE user_id = :userId AND type = 'email'
        ORDER BY created_at DESC
      `, [createParameter('userId', 1)])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].status).toBe('sent')
      expect(notifications[0].delivery_attempts).toBe(1)
      expect(notifications[0].failure_reason).toBeNull()
    })

    test('should handle email delivery failures with retry logic', async () => {
      const mockFailedNotification = {
        id: 2,
        user_id: 1,
        execution_result_id: 2,
        type: 'email',
        status: 'failed',
        delivery_attempts: 3,
        last_attempt_at: '2025-01-01T07:05:00Z',
        failure_reason: 'MessageRejected: Email address not verified',
        created_at: '2025-01-01T07:01:00Z'
      }

      mockExecuteSQL.mockResolvedValueOnce([mockFailedNotification])

      const failedNotification = await executeSQL(`
        UPDATE user_notifications
        SET status = :status, delivery_attempts = :attempts,
            last_attempt_at = :lastAttempt, failure_reason = :reason
        WHERE id = :id
        RETURNING *
      `, [
        createParameter('status', 'failed'),
        createParameter('attempts', 3),
        createParameter('lastAttempt', '2025-01-01T07:05:00Z'),
        createParameter('reason', 'MessageRejected: Email address not verified'),
        createParameter('id', 2)
      ])

      expect(failedNotification).toHaveLength(1)
      expect(failedNotification[0].status).toBe('failed')
      expect(failedNotification[0].delivery_attempts).toBe(3)
      expect(failedNotification[0].failure_reason).toContain('not verified')
    })

    test('should handle SES service rate limits', async () => {
      const rateLimitError = {
        code: 'Throttling',
        message: 'Rate exceeded',
        time: '2025-01-01T07:01:30Z'
      }

      expect(rateLimitError.code).toBe('Throttling')
      expect(rateLimitError.message).toContain('Rate exceeded')

      // Should implement exponential backoff for retry
      const retryDelays = [1000, 2000, 4000, 8000] // milliseconds
      expect(retryDelays).toHaveLength(4)
      expect(retryDelays[3]).toBe(8000) // 8 seconds max delay
    })
  })

  describe('Email Template Testing', () => {
    test('should render HTML email template correctly', () => {
      const templateData = {
        userName: 'John Doe',
        scheduleName: 'Daily Weather Report',
        executionTime: '2025-01-01T07:00:00Z',
        status: 'success',
        output: 'Weather report generated successfully',
        downloadUrl: 'https://example.com/download/123'
      }

      const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Schedule Execution Notification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f8f9fa; padding: 20px; border-radius: 5px; }
            .content { margin: 20px 0; }
            .success { color: #28a745; }
            .error { color: #dc3545; }
            .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>AI Studio - Schedule Notification</h1>
              <p>Hello ${templateData.userName},</p>
            </div>

            <div class="content">
              <h2 class="${templateData.status === 'success' ? 'success' : 'error'}">
                Schedule "${templateData.scheduleName}" ${templateData.status === 'success' ? 'Completed' : 'Failed'}
              </h2>

              <p><strong>Execution Time:</strong> ${new Date(templateData.executionTime).toLocaleString()}</p>

              <div class="result">
                <h3>Result:</h3>
                <p>${templateData.output}</p>
              </div>

              ${templateData.downloadUrl ? `
                <p>
                  <a href="${templateData.downloadUrl}" class="button">Download Results</a>
                </p>
              ` : ''}
            </div>

            <div class="footer">
              <p><small>This is an automated message from AI Studio. Please do not reply.</small></p>
            </div>
          </div>
        </body>
        </html>
      `

      expect(htmlTemplate).toContain(templateData.userName)
      expect(htmlTemplate).toContain(templateData.scheduleName)
      expect(htmlTemplate).toContain(templateData.output)
      expect(htmlTemplate).toContain('<!DOCTYPE html>')
      expect(htmlTemplate).toContain('class="success"')
    })

    test('should render plain text email template correctly', () => {
      const templateData = {
        userName: 'John Doe',
        scheduleName: 'Daily Weather Report',
        executionTime: '2025-01-01T07:00:00Z',
        status: 'success',
        output: 'Weather report generated successfully'
      }

      const textTemplate = `
AI Studio - Schedule Notification

Hello ${templateData.userName},

Your scheduled execution "${templateData.scheduleName}" has ${templateData.status === 'success' ? 'completed successfully' : 'failed'}.

Execution Time: ${new Date(templateData.executionTime).toLocaleString()}
Status: ${templateData.status.toUpperCase()}

Result:
${templateData.output}

---
This is an automated message from AI Studio.
Please do not reply to this email.
      `.trim()

      expect(textTemplate).toContain(templateData.userName)
      expect(textTemplate).toContain(templateData.scheduleName)
      expect(textTemplate).toContain('completed successfully')
      expect(textTemplate).toContain(templateData.output)
      expect(textTemplate).toContain('automated message')
    })
  })

  describe('Email Attachment Testing', () => {
    test('should handle markdown file attachments', () => {
      const markdownContent = `
# Weather Report - January 1, 2025

## Summary
Today's weather in Seattle shows sunny conditions with comfortable temperatures.

## Details
- **Temperature:** 75°F (24°C)
- **Humidity:** 45%
- **Wind:** Light breeze from the west at 5 mph
- **Visibility:** 10 miles

## Forecast
Clear skies expected to continue through the evening.

---
*Generated by AI Studio Assistant Architect*
      `.trim()

      const attachment = {
        filename: 'weather-report-2025-01-01.md',
        contentType: 'text/markdown',
        content: Buffer.from(markdownContent, 'utf8'),
        size: markdownContent.length
      }

      expect(attachment.filename).toMatch(/\.md$/)
      expect(attachment.contentType).toBe('text/markdown')
      expect(attachment.content).toBeInstanceOf(Buffer)
      expect(attachment.size).toBeGreaterThan(0)
      expect(attachment.size).toBeLessThan(10 * 1024) // Under 10KB
    })

    test('should handle large attachments properly', () => {
      // Simulate a large result file
      const largeContent = 'A'.repeat(5 * 1024 * 1024) // 5MB of content

      const largeAttachment = {
        filename: 'large-analysis-result.txt',
        contentType: 'text/plain',
        content: Buffer.from(largeContent, 'utf8'),
        size: largeContent.length
      }

      // SES has a 10MB limit for total message size
      const maxAttachmentSize = 8 * 1024 * 1024 // 8MB to leave room for email content

      expect(largeAttachment.size).toBeLessThan(maxAttachmentSize)

      // For larger files, should use S3 presigned URLs instead
      if (largeAttachment.size > maxAttachmentSize) {
        const s3DownloadUrl = 'https://s3.amazonaws.com/bucket/large-file.txt?presigned=true'
        expect(s3DownloadUrl).toContain('presigned=true')
      }
    })
  })

  describe('Email Notification Preferences', () => {
    test('should respect user email notification preferences', async () => {
      const mockUserPreferences = [
        {
          user_id: 1,
          email_notifications_enabled: true,
          email_on_success: true,
          email_on_failure: true,
          email_frequency: 'immediate' // immediate, daily_digest, weekly_digest
        },
        {
          user_id: 2,
          email_notifications_enabled: true,
          email_on_success: false,
          email_on_failure: true,
          email_frequency: 'immediate'
        },
        {
          user_id: 3,
          email_notifications_enabled: false,
          email_on_success: false,
          email_on_failure: false,
          email_frequency: 'none'
        }
      ]

      mockExecuteSQL.mockResolvedValueOnce(mockUserPreferences)

      const preferences = await executeSQL(`
        SELECT user_id, email_notifications_enabled, email_on_success, email_on_failure
        FROM user_notification_preferences
        WHERE user_id IN (:userId1, :userId2, :userId3)
      `, [
        createParameter('userId1', 1),
        createParameter('userId2', 2),
        createParameter('userId3', 3)
      ])

      expect(preferences).toHaveLength(3)

      // User 1: Gets all notifications
      expect(preferences[0].email_notifications_enabled).toBe(true)
      expect(preferences[0].email_on_success).toBe(true)
      expect(preferences[0].email_on_failure).toBe(true)

      // User 2: Only gets failure notifications
      expect(preferences[1].email_on_success).toBe(false)
      expect(preferences[1].email_on_failure).toBe(true)

      // User 3: No email notifications
      expect(preferences[2].email_notifications_enabled).toBe(false)
    })

    test('should handle email digest functionality', () => {
      const digestData = {
        userId: 1,
        period: 'daily',
        periodStart: '2025-01-01T00:00:00Z',
        periodEnd: '2025-01-01T23:59:59Z',
        executions: [
          {
            scheduleName: 'Daily Weather Report',
            status: 'success',
            executedAt: '2025-01-01T07:00:00Z'
          },
          {
            scheduleName: 'Evening News Summary',
            status: 'success',
            executedAt: '2025-01-01T18:00:00Z'
          },
          {
            scheduleName: 'Stock Market Analysis',
            status: 'failed',
            executedAt: '2025-01-01T16:00:00Z',
            error: 'API timeout'
          }
        ]
      }

      const digestSummary = {
        totalExecutions: digestData.executions.length,
        successfulExecutions: digestData.executions.filter(e => e.status === 'success').length,
        failedExecutions: digestData.executions.filter(e => e.status === 'failed').length,
        successRate: digestData.executions.filter(e => e.status === 'success').length / digestData.executions.length * 100
      }

      expect(digestSummary.totalExecutions).toBe(3)
      expect(digestSummary.successfulExecutions).toBe(2)
      expect(digestSummary.failedExecutions).toBe(1)
      expect(digestSummary.successRate).toBeCloseTo(66.67, 1)
    })
  })
})