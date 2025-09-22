import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

export interface EmailNotificationStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  // Cross-stack dependencies retrieved from SSM Parameter Store
  databaseResourceArn?: string;
  databaseSecretArn?: string;
  // Email configuration - allows different organizations to customize
  emailDomain?: string;
  fromEmail?: string;
  appBaseUrl?: string;
  // SES resource management
  createSesIdentity?: boolean; // Set to false if SES identity already exists
  useDomainIdentity?: boolean; // Use domain identity for prod, email identity for dev
}

export class EmailNotificationStack extends cdk.Stack {
  public readonly notificationSenderFunction: lambda.Function;
  public readonly notificationQueue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: EmailNotificationStackProps) {
    super(scope, id, props);

    // Email configuration with defaults for PSD401
    const emailDomain = props.emailDomain || 'psd401.net';
    const fromEmail = props.fromEmail || `noreply@${emailDomain}`;
    const appBaseUrl = props.appBaseUrl ||
      (props.environment === 'prod' ? 'https://aistudio.psd401.ai' : 'https://dev.aistudio.psd401.ai');

    // Retrieve values from SSM Parameter Store (or use provided props for backward compatibility)
    const databaseResourceArn = props.databaseResourceArn ||
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${props.environment}/db-cluster-arn`
      );

    const databaseSecretArn = props.databaseSecretArn ||
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${props.environment}/db-secret-arn`
      );

    // SES Configuration - Configurable identity creation
    const createSesIdentity = props.createSesIdentity !== false; // Default to true
    const useDomainIdentity = props.useDomainIdentity || (props.environment === 'prod');

    // Only create SES identity if explicitly requested
    if (createSesIdentity) {
      const emailIdentity = new ses.EmailIdentity(this, 'SESEmailIdentity', {
        identity: useDomainIdentity
          ? ses.Identity.domain(emailDomain)
          : ses.Identity.email(fromEmail),
      });

      // Retain the identity if stack is deleted (don't break email functionality)
      emailIdentity.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    }

    // Note: If createSesIdentity is false, assumes the email identity is already verified externally

    // SES Configuration Set for tracking delivery events
    const configurationSet = new ses.ConfigurationSet(this, 'EmailConfigurationSet', {
      configurationSetName: `aistudio-${props.environment}-email-config`,
    });

    // Email Template for AI Studio notifications
    const templateName = `aistudio-${props.environment}-notification-template`;
    const emailTemplate = new ses.CfnTemplate(this, 'NotificationEmailTemplate', {
      template: {
        templateName: templateName,
        subjectPart: '{{subject}}',
        textPart: `Peninsula School District AI Studio

{{greeting}},

Your scheduled "{{scheduleName}}" execution completed {{status}} at {{executionTime}}.

{{#if summary}}
Summary:
{{summary}}
{{/if}}

{{#if errorMessage}}
Error Details:
{{errorMessage}}
{{/if}}

View full results: {{resultsUrl}}

---
Peninsula School District AI Studio
`,
        htmlPart: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{subject}}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a8a; color: white; padding: 20px; text-align: center; }
        .logo { font-size: 24px; font-weight: bold; }
        .content { padding: 20px; background: #f9fafb; }
        .summary { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .success { border-left: 4px solid #10b981; }
        .error { border-left: 4px solid #ef4444; }
        .button { display: inline-block; background: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Peninsula School District</div>
            <div>AI Studio</div>
        </div>
        <div class="content">
            <h2>{{greeting}}</h2>

            <p>Your scheduled "<strong>{{scheduleName}}</strong>" execution completed {{status}} at {{executionTime}}.</p>

            {{#if summary}}
            <div class="summary {{#if isSuccess}}success{{else}}error{{/if}}">
                <h3>Summary</h3>
                <p>{{summary}}</p>
            </div>
            {{/if}}

            {{#if errorMessage}}
            <div class="summary error">
                <h3>Error Details</h3>
                <p>{{errorMessage}}</p>
            </div>
            {{/if}}

            <div style="text-align: center; margin: 20px 0;">
                <a href="{{resultsUrl}}" class="button">View Full Results</a>
                <a href="{{manageSchedulesUrl}}" class="button" style="background: #6b7280;">Manage Schedules</a>
            </div>
        </div>
        <div class="footer">
            <p>Peninsula School District AI Studio</p>
            <p><a href="{{unsubscribeUrl}}">Unsubscribe</a> | <a href="{{preferencesUrl}}">Email Preferences</a></p>
        </div>
    </div>
</body>
</html>`
      }
    });

    // Dead Letter Queue for failed notification processing
    this.deadLetterQueue = new sqs.Queue(this, 'NotificationDLQ', {
      queueName: `aistudio-${props.environment}-notification-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // SQS Queue for notification processing
    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `aistudio-${props.environment}-notification-queue`,
      visibilityTimeout: cdk.Duration.minutes(5), // Should be >= Lambda timeout
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3, // Retry failed notifications 3 times
      },
    });

    // CloudWatch Log Group for notification sender
    const notificationLogGroup = new logs.LogGroup(this, 'NotificationLogGroup', {
      logGroupName: `/aws/lambda/aistudio-${props.environment}-notification-sender`,
      retention: props.environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Lambda function for sending email notifications
    this.notificationSenderFunction = new lambda.Function(this, 'NotificationSender', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/notification-sender'), {
        // Use a simple local bundling command that pre-compiles TypeScript
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                const fs = require('fs');
                const execSync = require('child_process').execSync;

                // Check if we can compile locally
                execSync('which npm', { stdio: 'ignore' });

                const sourceDir = path.join(__dirname, '../lambdas/notification-sender');

                // Copy source files
                execSync(`cp -r ${sourceDir}/* ${outputDir}/`);

                // Install dependencies
                execSync('npm install', { cwd: outputDir, stdio: 'inherit' });

                // Compile TypeScript
                execSync('npm run build', { cwd: outputDir, stdio: 'inherit' });

                // Copy compiled files to root and clean up
                execSync(`cp -r ${outputDir}/dist/* ${outputDir}/`);
                execSync(`rm -rf ${outputDir}/dist ${outputDir}/*.ts ${outputDir}/tsconfig.json`);

                return true;
              } catch (error) {
                return false; // Fall back to Docker
              }
            }
          }
        }
      }),
      functionName: `aistudio-${props.environment}-notification-sender`,
      timeout: cdk.Duration.minutes(3), // Time to process notification and send email
      memorySize: 1024, // Sufficient for email processing
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DATABASE_RESOURCE_ARN: databaseResourceArn,
        DATABASE_SECRET_ARN: databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
        SES_CONFIGURATION_SET: configurationSet.configurationSetName,
        SES_TEMPLATE_NAME: templateName,
        SES_FROM_EMAIL: fromEmail,
        APP_BASE_URL: appBaseUrl,
        SES_REGION: 'us-east-1', // SES identities are configured in us-east-1
      },
      logGroup: notificationLogGroup,
      // Conservative concurrency to avoid SES rate limits
      reservedConcurrentExecutions: props.environment === 'prod' ? 5 : 2,
    });

    // Connect SQS queue to Lambda function
    this.notificationSenderFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.notificationQueue, {
        batchSize: 5, // Process up to 5 notifications at once
        maxBatchingWindow: cdk.Duration.seconds(10), // Wait up to 10s to batch
        reportBatchItemFailures: true, // Enable partial batch failure reporting
      })
    );

    // IAM permissions for Lambda function

    // Grant RDS Data API permissions
    const rdsDataApiPolicy = new iam.PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [databaseResourceArn],
    });

    const secretsManagerPolicy = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [databaseSecretArn],
    });

    this.notificationSenderFunction.addToRolePolicy(rdsDataApiPolicy);
    this.notificationSenderFunction.addToRolePolicy(secretsManagerPolicy);

    // Grant SES permissions - SES resources are in us-east-1
    const sesRegion = 'us-east-1'; // SES identities configured region
    const sesPolicy = new iam.PolicyStatement({
      actions: [
        'ses:SendEmail',
        'ses:SendTemplatedEmail',
        'ses:SendRawEmail',
        'ses:GetTemplate',
        'ses:PutConfigurationSetEventDestination',
      ],
      resources: [
        `arn:aws:ses:${sesRegion}:${this.account}:identity/${emailDomain}`,
        `arn:aws:ses:${sesRegion}:${this.account}:identity/${fromEmail}`,
        `arn:aws:ses:${sesRegion}:${this.account}:identity/*@${emailDomain}`, // Allow any verified email in domain
        `arn:aws:ses:${sesRegion}:${this.account}:template/${templateName}`,
        `arn:aws:ses:${sesRegion}:${this.account}:configuration-set/${configurationSet.configurationSetName}`,
      ],
    });

    this.notificationSenderFunction.addToRolePolicy(sesPolicy);

    // Grant SQS permissions (automatically handled by event source, but explicit for clarity)
    this.notificationQueue.grantConsumeMessages(this.notificationSenderFunction);
    this.deadLetterQueue.grantSendMessages(this.notificationSenderFunction);

    // Store important values in SSM Parameter Store for other services
    new ssm.StringParameter(this, 'NotificationQueueUrlParam', {
      parameterName: `/aistudio/${props.environment}/notification-queue-url`,
      stringValue: this.notificationQueue.queueUrl,
      description: 'URL of the notification processing queue',
    });

    new ssm.StringParameter(this, 'NotificationSenderFunctionArnParam', {
      parameterName: `/aistudio/${props.environment}/notification-sender-function-arn`,
      stringValue: this.notificationSenderFunction.functionArn,
      description: 'ARN of the notification sender Lambda function',
    });

    new ssm.StringParameter(this, 'SESConfigurationSetParam', {
      parameterName: `/aistudio/${props.environment}/ses-configuration-set`,
      stringValue: configurationSet.configurationSetName,
      description: 'Name of the SES configuration set for tracking',
    });

    // Outputs
    new cdk.CfnOutput(this, 'NotificationQueueUrlOutput', {
      value: this.notificationQueue.queueUrl,
      description: 'URL of the notification processing queue',
      exportName: `${props.environment}-NotificationQueueUrl`,
    });

    new cdk.CfnOutput(this, 'NotificationSenderFunctionNameOutput', {
      value: this.notificationSenderFunction.functionName,
      description: 'Name of the notification sender Lambda function',
      exportName: `${props.environment}-NotificationSenderFunctionName`,
    });

    new cdk.CfnOutput(this, 'SESTemplateNameOutput', {
      value: templateName,
      description: 'Name of the SES email template',
      exportName: `${props.environment}-SESTemplateName`,
    });

    new cdk.CfnOutput(this, 'SESConfigurationSetOutput', {
      value: configurationSet.configurationSetName,
      description: 'Name of the SES configuration set',
      exportName: `${props.environment}-SESConfigurationSet`,
    });
  }
}