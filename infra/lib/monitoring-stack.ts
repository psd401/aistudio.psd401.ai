import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {
  ADOTInstrumentation,
  IntelligentAlerting,
  ObservabilityDashboards,
} from './constructs/observability';
import { SSEStreamingMonitoring } from './constructs/sse-streaming-monitoring';

export interface MonitoringStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  alertEmail?: string;
  amplifyAppId?: string;
  pagerDutyKey?: string;
  slackWebhook?: string;
}

/**
 * Enhanced Monitoring Stack with ADOT Integration
 *
 * Provides comprehensive observability through:
 * - AWS Distro for OpenTelemetry (ADOT) for unified telemetry collection
 * - Distributed tracing via AWS X-Ray
 * - Custom metrics and dashboards via CloudWatch
 * - Intelligent alerting with anomaly detection
 * - Automated incident response
 *
 * @see https://github.com/psd401/aistudio.psd401.ai/issues/380
 */
export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alarmTopic: sns.Topic;
  public readonly adotInstrumentation: ADOTInstrumentation;
  public readonly intelligentAlerting: IntelligentAlerting;
  public readonly observabilityDashboards: ObservabilityDashboards;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment, alertEmail, amplifyAppId, pagerDutyKey, slackWebhook } = props;

    // Get Amplify app ID from props or SSM Parameter Store
    const amplifyAppIdValue =
      amplifyAppId || ssm.StringParameter.valueForStringParameter(this, `/aistudio/${environment}/amplify-app-id`);

    // Construct the actual log group name using the app ID
    const amplifyLogGroupName = `/aws/amplify/${amplifyAppIdValue}`;

    // ============================================================================
    // SNS Topic for Alarms
    // ============================================================================
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `aistudio-${environment}-monitoring-alarms`,
      displayName: `AI Studio ${environment.toUpperCase()} Monitoring Alarms`,
    });

    // Add email subscription if provided
    if (alertEmail) {
      this.alarmTopic.addSubscription(new sns_subscriptions.EmailSubscription(alertEmail));
    }

    // ============================================================================
    // ADOT Instrumentation
    // ============================================================================
    this.adotInstrumentation = new ADOTInstrumentation(this, 'ADOTInstrumentation', {
      environment,
      version: '1.0.0',
    });

    // ============================================================================
    // Intelligent Alerting System
    // ============================================================================
    this.intelligentAlerting = new IntelligentAlerting(this, 'IntelligentAlerting', {
      environment,
      serviceName: 'aistudio',
      alarmTopic: this.alarmTopic,
      pagerDutyKey,
      slackWebhook,
    });

    // ============================================================================
    // Observability Dashboards
    // ============================================================================
    this.observabilityDashboards = new ObservabilityDashboards(this, 'ObservabilityDashboards', {
      environment,
      amplifyAppId: amplifyAppIdValue,
    });

    // Use the service dashboard as the primary dashboard
    this.dashboard = this.observabilityDashboards.serviceDashboard;

    // ============================================================================
    // Legacy Monitoring Components (Enhanced)
    // ============================================================================
    // Add enhanced log insights and alarm widgets
    this.addEnhancedMonitoring(environment, amplifyLogGroupName);

    // Add SSE Streaming monitoring (issue #365)
    new SSEStreamingMonitoring(this, 'SSEStreamingMonitoring', {
      environment,
      alarmTopic: this.alarmTopic,
      dashboard: this.dashboard,
    });

    // ============================================================================
    // Additional Alarms
    // ============================================================================
    this.createCriticalAlarms(environment);

    // ============================================================================
    // Outputs
    // ============================================================================
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic for monitoring alarms',
      exportName: `${environment}-MonitoringAlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'ADOTLayerArn', {
      value: this.adotInstrumentation.lambdaLayer.layerVersionArn,
      description: 'ADOT Lambda Layer ARN for instrumentation',
      exportName: `${environment}-ADOTLayerArn`,
    });
  }

  /**
   * Add enhanced monitoring widgets for logs and insights
   */
  private addEnhancedMonitoring(environment: string, logGroupName: string): void {
    // Add section header
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `## Application Insights`,
        width: 24,
        height: 1,
      })
    );

    // Recent Errors
    this.dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: 'Recent Errors (Last Hour)',
        logGroupNames: [logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, @message, level, error.code as errorCode, requestId',
          'filter level = "error"',
          'sort @timestamp desc',
          'limit 20',
        ],
        width: 12,
        height: 8,
        region: this.region,
      }),

      // Slow Operations
      new cloudwatch.LogQueryWidget({
        title: 'Slow Operations (>1s)',
        logGroupNames: [logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, action, duration, requestId',
          'filter ispresent(duration) and duration > 1000',
          'sort duration desc',
          'limit 20',
        ],
        width: 12,
        height: 8,
        region: this.region,
      })
    );

    // User Activity
    this.dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: 'Top Active Users',
        logGroupNames: [logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields userId, userEmail',
          'filter ispresent(userId)',
          'stats count() as actions by userId, userEmail',
          'sort actions desc',
          'limit 10',
        ],
        width: 12,
        height: 6,
        region: this.region,
      }),

      // Authentication Events
      new cloudwatch.LogQueryWidget({
        title: 'Authentication Events',
        logGroupNames: [logGroupName],
        view: cloudwatch.LogQueryVisualizationType.PIE,
        queryLines: ['fields action', 'filter action like /auth/', 'stats count() by action'],
        width: 12,
        height: 6,
        region: this.region,
      })
    );

    // Insights Queries Reference
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: this.getInsightsQueriesReference(),
        width: 24,
        height: 8,
      })
    );
  }

  /**
   * Create critical system alarms
   */
  private createCriticalAlarms(environment: string): void {
    // Database high utilization alarm
    const dbUtilizationAlarm = new cloudwatch.Alarm(this, 'DatabaseHighUtilization', {
      alarmName: `${environment}-database-high-utilization`,
      alarmDescription: 'Database ACU utilization exceeds 80%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'ACUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: `aistudio-${environment}`,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda errors alarm
    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, 'LambdaErrors', {
      alarmName: `${environment}-lambda-errors`,
      alarmDescription: 'Lambda function errors detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: `aistudio-${environment}-file-processor`,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // DLQ messages alarm
    const dlqAlarm = new cloudwatch.Alarm(this, 'DLQMessages', {
      alarmName: `${environment}-dlq-messages`,
      alarmDescription: 'Messages in dead letter queue',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: `aistudio-${environment}-file-processing-dlq`,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add alarm actions
    const alarms = [dbUtilizationAlarm, lambdaErrorsAlarm, dlqAlarm];
    alarms.forEach((alarm) => {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
    });

    // Add alarm status widget to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Critical Alarm Status',
        alarms,
        width: 24,
        height: 3,
        sortBy: cloudwatch.AlarmStatusWidgetSortBy.STATE_UPDATED_TIMESTAMP,
      })
    );
  }

  /**
   * Get CloudWatch Insights queries reference markdown
   */
  private getInsightsQueriesReference(): string {
    return `## Useful CloudWatch Insights Queries

### Find all logs for a specific request
\`\`\`
fields @timestamp, level, message, requestId, error.code
| filter requestId = "YOUR_REQUEST_ID"
| sort @timestamp desc
\`\`\`

### Top error codes in last hour
\`\`\`
fields error.code
| filter level = "error" and ispresent(error.code)
| stats count() by error.code
| sort count() desc
\`\`\`

### Slow database queries
\`\`\`
fields @timestamp, duration, action, query
| filter duration > 1000 and action like /DB/
| sort duration desc
| limit 50
\`\`\`

### User activity audit
\`\`\`
fields @timestamp, userId, action, message
| filter userId = "USER_ID"
| sort @timestamp desc
| limit 100
\`\`\`

### Failed authentication attempts
\`\`\`
fields @timestamp, message, error.code, userId
| filter error.code like /AUTH_/
| sort @timestamp desc
| limit 50
\`\`\`

### X-Ray Trace Analysis
\`\`\`
fields @timestamp, xrayTraceId, @message
| filter ispresent(xrayTraceId)
| sort @timestamp desc
| limit 100
\`\`\`

[Open CloudWatch Insights](https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:logs-insights)
[Open X-Ray Service Map](https://console.aws.amazon.com/xray/home?region=${this.region}#/service-map)
`;
  }
}
