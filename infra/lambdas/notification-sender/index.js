const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Lambda logging utilities (simplified version of main app pattern)
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function startTimer(operation) {
  const startTime = Date.now();
  return (context = {}) => {
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Operation completed',
      operation,
      duration,
      timestamp: new Date().toISOString(),
      ...context
    }));
  };
}

function createLogger(context = {}) {
  const baseContext = {
    timestamp: new Date().toISOString(),
    environment: 'lambda',
    service: 'notification-sender',
    ...context
  };

  return {
    info: (message, meta = {}) => {
      console.log(JSON.stringify({
        level: 'INFO',
        message,
        ...baseContext,
        ...meta
      }));
    },
    error: (message, meta = {}) => {
      console.error(JSON.stringify({
        level: 'ERROR',
        message,
        ...baseContext,
        ...meta
      }));
    },
    warn: (message, meta = {}) => {
      console.warn(JSON.stringify({
        level: 'WARN',
        message,
        ...baseContext,
        ...meta
      }));
    },
    debug: (message, meta = {}) => {
      console.log(JSON.stringify({
        level: 'DEBUG',
        message,
        ...baseContext,
        ...meta
      }));
    }
  };
}

// Security utility functions
function safeParseInt(value, fieldName = 'value') {
  if (value === null || value === undefined) {
    throw new Error(`Invalid ${fieldName}: value is null or undefined`);
  }

  const stringValue = String(value).trim();
  if (stringValue === '') {
    throw new Error(`Invalid ${fieldName}: empty string`);
  }

  const parsed = parseInt(stringValue, 10);
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }

  return parsed;
}

function safeJsonParse(jsonString, fallback = null, fieldName = 'JSON data') {
  if (!jsonString) {
    return fallback;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    const log = createLogger({ operation: 'safeJsonParse' });
    log.error('JSON parse error', {
      fieldName,
      error: error.message,
      jsonLength: jsonString?.length
    });
    return fallback;
  }
}

function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential', 'email'];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Initialize clients
const rdsClient = new RDSDataClient({});
const sesClient = new SESClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

// Environment variables with startup validation
const requiredEnvVars = {
  DATABASE_RESOURCE_ARN: process.env.DATABASE_RESOURCE_ARN,
  DATABASE_SECRET_ARN: process.env.DATABASE_SECRET_ARN,
  DATABASE_NAME: process.env.DATABASE_NAME,
  ENVIRONMENT: process.env.ENVIRONMENT,
  SES_TEMPLATE_NAME: process.env.SES_TEMPLATE_NAME,
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
  APP_BASE_URL: process.env.APP_BASE_URL
};

const optionalEnvVars = {
  SES_CONFIGURATION_SET: process.env.SES_CONFIGURATION_SET
};

// Validate required environment variables at startup
function validateEnvironmentVariables() {
  const missingVars = [];

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value || value.trim() === '') {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
    console.error(JSON.stringify({
      level: 'ERROR',
      message: 'Lambda startup failed - missing environment variables',
      missingVariables: missingVars,
      timestamp: new Date().toISOString(),
      service: 'notification-sender'
    }));
    throw new Error(errorMessage);
  }

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Environment variables validated successfully',
    requiredVarsPresent: Object.keys(requiredEnvVars).length,
    optionalVarsPresent: Object.values(optionalEnvVars).filter(Boolean).length,
    timestamp: new Date().toISOString(),
    service: 'notification-sender'
  }));
}

// Run validation at module load time
validateEnvironmentVariables();

// Export validated environment variables
const DATABASE_RESOURCE_ARN = requiredEnvVars.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = requiredEnvVars.DATABASE_SECRET_ARN;
const DATABASE_NAME = requiredEnvVars.DATABASE_NAME;
const ENVIRONMENT = requiredEnvVars.ENVIRONMENT;
const SES_TEMPLATE_NAME = requiredEnvVars.SES_TEMPLATE_NAME;
const SES_FROM_EMAIL = requiredEnvVars.SES_FROM_EMAIL;
const APP_BASE_URL = requiredEnvVars.APP_BASE_URL;
const SES_CONFIGURATION_SET = optionalEnvVars.SES_CONFIGURATION_SET;

/**
 * Notification Sender Lambda - SQS Handler
 *
 * Processes notification requests from SQS queue:
 * 1. Retrieves user email from Cognito user pool
 * 2. Fetches execution result data from database
 * 3. Generates markdown attachment with full execution output
 * 4. Sends branded email notification via SES
 * 5. Updates notification status in database
 *
 * Message format:
 * {
 *   "executionResultId": 123,
 *   "userId": 456,
 *   "notificationType": "email",
 *   "scheduleName": "Weather Report - Daily"
 * }
 */
exports.handler = async (event, context) => {
  const requestId = generateRequestId();
  const timer = startTimer('lambda.handler');
  const log = createLogger({ requestId, operation: 'notificationSender' });

  log.info('Notification sender Lambda started', {
    recordCount: event.Records?.length || 0,
    environment: ENVIRONMENT
  });

  const results = [];

  try {
    // Process each SQS record
    for (const record of event.Records || []) {
      const recordTimer = startTimer('process_record');
      const recordLog = createLogger({ requestId, recordId: record.messageId });

      try {
        const messageBody = safeJsonParse(record.body, {}, 'SQS message body');

        recordLog.info('Processing notification request', {
          executionResultId: messageBody.executionResultId,
          userId: messageBody.userId,
          notificationType: messageBody.notificationType
        });

        const result = await processNotificationRequest(messageBody, requestId);

        results.push({
          messageId: record.messageId,
          status: 'success',
          result
        });

        recordTimer({ status: 'success' });
        recordLog.info('Notification processed successfully');

      } catch (error) {
        recordLog.error('Failed to process notification', {
          error: error.message,
          messageId: record.messageId
        });

        results.push({
          messageId: record.messageId,
          status: 'error',
          error: error.message
        });

        recordTimer({ status: 'error' });
      }
    }

    timer({ status: 'success' });
    log.info('Notification batch completed', {
      totalRecords: results.length,
      successCount: results.filter(r => r.status === 'success').length,
      errorCount: results.filter(r => r.status === 'error').length
    });

    // Return partial batch failure information for SQS
    const failedRecords = results
      .filter(r => r.status === 'error')
      .map(r => ({ itemIdentifier: r.messageId }));

    return {
      batchItemFailures: failedRecords
    };

  } catch (error) {
    log.error('Notification sender failed', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      requestId
    });
    timer({ status: 'error' });

    // Return all records as failed for retry
    return {
      batchItemFailures: (event.Records || []).map(record => ({
        itemIdentifier: record.messageId
      }))
    };
  }
};

/**
 * Process a single notification request
 */
async function processNotificationRequest(messageBody, requestId) {
  const log = createLogger({ requestId, operation: 'processNotificationRequest' });
  const { executionResultId, userId, notificationType, scheduleName } = messageBody;

  // Validate required fields
  const executionResultIdInt = safeParseInt(executionResultId, 'execution result ID');
  const userIdInt = safeParseInt(userId, 'user ID');

  if (!notificationType || notificationType !== 'email') {
    throw new Error(`Unsupported notification type: ${notificationType}`);
  }

  log.info('Processing notification request', {
    executionResultId: executionResultIdInt,
    userId: userIdInt,
    scheduleName
  });

  // Create notification record in database
  const notificationId = await createNotificationRecord(
    userIdInt,
    executionResultIdInt,
    notificationType
  );

  try {
    // Fetch execution result data
    const executionResult = await getExecutionResult(executionResultIdInt);
    if (!executionResult) {
      throw new Error(`Execution result not found: ${executionResultIdInt}`);
    }

    // Get user email from Cognito
    const userEmail = await getUserEmail(userIdInt);
    if (!userEmail) {
      throw new Error(`User email not found for user: ${userIdInt}`);
    }

    // Generate email content and send
    await sendEmailNotification(
      userEmail,
      executionResult,
      scheduleName || 'Assistant Architect Execution',
      notificationId
    );

    // Update notification status
    await updateNotificationStatus(notificationId, 'sent');

    log.info('Email notification sent successfully', {
      notificationId,
      executionResultId: executionResultIdInt
    });

    return {
      notificationId,
      status: 'sent',
      email: userEmail.replace(/(.{2}).*@/, '$1***@') // Mask email for logging
    };

  } catch (error) {
    log.error('Failed to process notification', {
      error: error.message,
      notificationId
    });

    // Update notification status with failure
    await updateNotificationStatus(notificationId, 'failed', error.message);
    throw error;
  }
}

/**
 * Create notification record in database
 */
async function createNotificationRecord(userId, executionResultId, type) {
  const log = createLogger({ operation: 'createNotificationRecord' });

  try {
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        INSERT INTO user_notifications (
          user_id,
          execution_result_id,
          type,
          status,
          delivery_attempts,
          created_at
        ) VALUES (
          :user_id,
          :execution_result_id,
          :type,
          'pending',
          0,
          NOW()
        )
        RETURNING id
      `,
      parameters: [
        { name: 'user_id', value: { longValue: userId } },
        { name: 'execution_result_id', value: { longValue: executionResultId } },
        { name: 'type', value: { stringValue: type } }
      ]
    });

    const response = await rdsClient.send(command);
    return response.records[0][0].longValue;
  } catch (error) {
    log.error('Failed to create notification record', {
      error: error.message,
      userId: sanitizeForLogging(userId),
      executionResultId: sanitizeForLogging(executionResultId)
    });
    throw error;
  }
}

/**
 * Get execution result data from database
 */
async function getExecutionResult(executionResultId) {
  const log = createLogger({ operation: 'getExecutionResult' });

  try {
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
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
          aa.name as assistant_architect_name
        FROM execution_results er
        JOIN scheduled_executions se ON er.scheduled_execution_id = se.id
        JOIN assistant_architects aa ON se.assistant_architect_id = aa.id
        WHERE er.id = :execution_result_id
      `,
      parameters: [
        { name: 'execution_result_id', value: { longValue: executionResultId } }
      ]
    });

    const response = await rdsClient.send(command);

    if (!response.records || response.records.length === 0) {
      return null;
    }

    const record = response.records[0];

    return {
      id: record[0].longValue,
      scheduled_execution_id: record[1].longValue,
      result_data: record[2].stringValue ? safeJsonParse(record[2].stringValue, {}, 'result_data') : {},
      status: record[3].stringValue,
      executed_at: record[4].stringValue,
      execution_duration_ms: record[5].longValue,
      error_message: record[6].stringValue,
      schedule_name: record[7].stringValue,
      user_id: record[8].longValue,
      assistant_architect_name: record[9].stringValue
    };
  } catch (error) {
    log.error('Failed to get execution result', {
      error: error.message,
      executionResultId: sanitizeForLogging(executionResultId)
    });
    throw error;
  }
}

/**
 * Get user email from database (stored from Cognito during user creation)
 */
async function getUserEmail(userId) {
  const log = createLogger({ operation: 'getUserEmail' });

  try {
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        SELECT email, cognito_user_id
        FROM users
        WHERE id = :user_id
      `,
      parameters: [
        { name: 'user_id', value: { longValue: userId } }
      ]
    });

    const response = await rdsClient.send(command);

    if (!response.records || response.records.length === 0) {
      return null;
    }

    const record = response.records[0];
    const email = record[0].stringValue;

    // If email is not in our database, we can try to get it from Cognito
    // (This is a fallback, normally email should be stored during user creation)
    if (!email && record[1].stringValue) {
      log.info('Email not in database, attempting Cognito lookup');
      // This would require additional Cognito permissions and user pool ID
      // For now, return null to indicate email not available
      return null;
    }

    return email;
  } catch (error) {
    log.error('Failed to get user email', {
      error: error.message,
      userId: sanitizeForLogging(userId)
    });
    throw error;
  }
}

/**
 * Send email notification using SES template
 */
async function sendEmailNotification(userEmail, executionResult, scheduleName, notificationId) {
  const log = createLogger({ operation: 'sendEmailNotification', notificationId });

  try {
    // Prepare template data
    const isSuccess = executionResult.status === 'success';
    const executionTime = new Date(executionResult.executed_at).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    // Generate summary from result data
    const summary = generateExecutionSummary(executionResult.result_data);

    // Create markdown attachment
    const markdownContent = generateMarkdownAttachment(executionResult, scheduleName);

    const templateData = {
      subject: `${scheduleName} - ${isSuccess ? 'Execution Complete' : 'Execution Failed'}`,
      greeting: `Hi there`, // Could be personalized with user name if available
      scheduleName,
      status: isSuccess ? 'successfully' : 'with errors',
      executionTime,
      summary: summary || (isSuccess ? 'Execution completed successfully.' : 'Execution encountered errors.'),
      errorMessage: executionResult.error_message || '',
      isSuccess: isSuccess.toString(),
      resultsUrl: `${APP_BASE_URL}/schedules/${executionResult.scheduled_execution_id}/results/${executionResult.id}`,
      manageSchedulesUrl: `${APP_BASE_URL}/schedules`,
      unsubscribeUrl: `${APP_BASE_URL}/preferences/unsubscribe`,
      preferencesUrl: `${APP_BASE_URL}/preferences`
    };

    log.info('Sending templated email', {
      templateName: SES_TEMPLATE_NAME,
      hasConfigurationSet: !!SES_CONFIGURATION_SET,
      executionStatus: executionResult.status
    });

    const emailParams = {
      Source: SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [userEmail]
      },
      Template: SES_TEMPLATE_NAME,
      TemplateData: JSON.stringify(templateData),
      ...(SES_CONFIGURATION_SET && {
        ConfigurationSetName: SES_CONFIGURATION_SET
      }),
      // Add markdown as attachment
      ...(markdownContent && {
        // Note: SES templated emails don't support attachments directly
        // For now, we'll include the markdown URL in the email body
        // In a production system, we'd upload to S3 and include a download link
      })
    };

    const response = await sesClient.send(new SendTemplatedEmailCommand(emailParams));

    log.info('Email sent successfully', {
      messageId: response.MessageId,
      notificationId
    });

    return response.MessageId;

  } catch (error) {
    log.error('Failed to send email', {
      error: error.message,
      notificationId,
      userEmail: sanitizeForLogging(userEmail)
    });
    throw error;
  }
}

/**
 * Generate execution summary from result data
 */
function generateExecutionSummary(resultData) {
  if (!resultData || typeof resultData !== 'object') {
    return null;
  }

  // Extract key information from the result data
  // This would be customized based on the actual structure of Assistant Architect results
  const summary = [];

  if (resultData.output) {
    // Truncate output to first 200 characters for summary
    const output = String(resultData.output);
    if (output.length > 200) {
      summary.push(output.substring(0, 200) + '...');
    } else {
      summary.push(output);
    }
  }

  if (resultData.metrics) {
    summary.push(`Processed in ${resultData.metrics.duration || 'unknown'} ms`);
  }

  if (resultData.warnings && resultData.warnings.length > 0) {
    summary.push(`${resultData.warnings.length} warning(s) generated`);
  }

  return summary.length > 0 ? summary.join('\n') : null;
}

/**
 * Generate markdown attachment content
 */
function generateMarkdownAttachment(executionResult, scheduleName) {
  const executionTime = new Date(executionResult.executed_at).toISOString();

  let markdown = `# ${scheduleName} - Execution Results\n\n`;
  markdown += `**Execution ID:** ${executionResult.id}\n`;
  markdown += `**Status:** ${executionResult.status}\n`;
  markdown += `**Executed At:** ${executionTime}\n`;
  markdown += `**Assistant Architect:** ${executionResult.assistant_architect_name}\n`;

  if (executionResult.execution_duration_ms) {
    markdown += `**Duration:** ${executionResult.execution_duration_ms}ms\n`;
  }

  markdown += `\n---\n\n`;

  if (executionResult.status === 'success' && executionResult.result_data) {
    markdown += `## Execution Output\n\n`;

    if (executionResult.result_data.output) {
      markdown += `${executionResult.result_data.output}\n\n`;
    }

    if (executionResult.result_data.metrics) {
      markdown += `## Metrics\n\n`;
      markdown += `\`\`\`json\n${JSON.stringify(executionResult.result_data.metrics, null, 2)}\n\`\`\`\n\n`;
    }
  } else if (executionResult.error_message) {
    markdown += `## Error Details\n\n`;
    markdown += `\`\`\`\n${executionResult.error_message}\n\`\`\`\n\n`;
  }

  markdown += `## Raw Result Data\n\n`;
  markdown += `\`\`\`json\n${JSON.stringify(executionResult.result_data, null, 2)}\n\`\`\`\n\n`;

  markdown += `---\n\n`;
  markdown += `*Generated by Peninsula School District AI Studio*\n`;
  markdown += `*View full results: ${APP_BASE_URL}/schedules/${executionResult.scheduled_execution_id}/results/${executionResult.id}*`;

  return markdown;
}

/**
 * Update notification status in database
 */
async function updateNotificationStatus(notificationId, status, failureReason = null) {
  const log = createLogger({ operation: 'updateNotificationStatus' });

  try {
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        UPDATE user_notifications
        SET
          status = :status,
          delivery_attempts = delivery_attempts + 1,
          last_attempt_at = NOW(),
          failure_reason = :failure_reason
        WHERE id = :notification_id
        RETURNING id
      `,
      parameters: [
        { name: 'notification_id', value: { longValue: notificationId } },
        { name: 'status', value: { stringValue: status } },
        {
          name: 'failure_reason',
          value: failureReason ? { stringValue: failureReason } : { isNull: true }
        }
      ]
    });

    const response = await rdsClient.send(command);
    const success = response.records && response.records.length > 0;

    if (!success) {
      throw new Error('Notification status update failed - no rows updated');
    }

    log.info('Notification status updated successfully', {
      notificationId,
      status
    });
    return true;
  } catch (error) {
    log.error('Failed to update notification status', {
      error: error.message,
      notificationId: sanitizeForLogging(notificationId),
      status
    });
    throw error;
  }
}