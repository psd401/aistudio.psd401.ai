/**
 * SSE Streaming Monitoring Construct
 *
 * Provides CloudWatch alarms and dashboard widgets for SSE streaming health monitoring.
 * Integrates with the monitoring created in issue #365.
 *
 * Features:
 * - Field mismatch alarms (critical - indicates SDK version issues)
 * - Parse error alarms (indicates data quality issues)
 * - Unknown event type tracking (forward compatibility indicator)
 * - Stream performance metrics (duration, throughput)
 * - Dashboard widgets for visibility
 *
 * @see https://github.com/psd401/aistudio.psd401.ai/issues/365
 */

import { Construct } from 'constructs'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as cdk from 'aws-cdk-lib'

export interface SSEStreamingMonitoringProps {
  /** Environment name (dev, prod, etc.) */
  environment: string
  /** SNS topic for alarm notifications */
  alarmTopic: sns.ITopic
  /** Dashboard to add widgets to */
  dashboard?: cloudwatch.Dashboard
}

/**
 * Construct for SSE Streaming monitoring infrastructure
 */
export class SSEStreamingMonitoring extends Construct {
  public readonly alarms: {
    fieldMismatch: cloudwatch.Alarm
    parseErrors: cloudwatch.Alarm
    unknownEvents: cloudwatch.Alarm
    streamFailures: cloudwatch.Alarm
  }

  constructor(scope: Construct, id: string, props: SSEStreamingMonitoringProps) {
    super(scope, id)

    const { environment, alarmTopic, dashboard } = props

    // Namespace for SSE streaming metrics
    const namespace = 'AIStudio/Streaming'

    // ========================================================================
    // CRITICAL ALARM: Field Mismatches
    // ========================================================================
    // This alarm catches issues like #355 where field names don't match SDK expectations
    this.alarms.fieldMismatch = new cloudwatch.Alarm(this, 'SSEFieldMismatchAlarm', {
      alarmName: `${environment}-sse-field-mismatches`,
      alarmDescription: 'CRITICAL: SSE field mismatch detected - possible AI SDK compatibility issue. This would have caught bug #355.',
      metric: new cloudwatch.Metric({
        namespace,
        metricName: 'SSEFieldMismatches',
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          Environment: environment
        }
      }),
      threshold: 1, // Alert on ANY field mismatch
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    // Add action to notify via SNS
    this.alarms.fieldMismatch.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic))

    // ========================================================================
    // HIGH PRIORITY ALARM: Parse Errors
    // ========================================================================
    // Indicates malformed SSE events or data quality issues
    this.alarms.parseErrors = new cloudwatch.Alarm(this, 'SSEParseErrorAlarm', {
      alarmName: `${environment}-sse-parse-errors`,
      alarmDescription: 'High parse error rate in SSE streams - check data quality and SDK compatibility',
      metric: new cloudwatch.Metric({
        namespace,
        metricName: 'SSEParseErrors',
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          Environment: environment
        }
      }),
      threshold: 10, // Alert if more than 10 parse errors in 5 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    this.alarms.parseErrors.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic))

    // ========================================================================
    // MEDIUM PRIORITY ALARM: Unknown Event Types
    // ========================================================================
    // May indicate new SDK version or malformed events
    this.alarms.unknownEvents = new cloudwatch.Alarm(this, 'SSEUnknownEventsAlarm', {
      alarmName: `${environment}-sse-unknown-events`,
      alarmDescription: 'High rate of unknown SSE event types - may indicate new SDK version or malformed events',
      metric: new cloudwatch.Metric({
        namespace,
        metricName: 'SSEUnknownEvents',
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(15),
        dimensionsMap: {
          Environment: environment
        }
      }),
      threshold: 50, // Alert if more than 50 unknown events in 15 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    this.alarms.unknownEvents.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic))

    // ========================================================================
    // STREAM FAILURE ALARM
    // ========================================================================
    // Monitors stream completion rate
    this.alarms.streamFailures = new cloudwatch.Alarm(this, 'SSEStreamFailuresAlarm', {
      alarmName: `${environment}-sse-stream-failures`,
      alarmDescription: 'High rate of failed SSE streams',
      metric: new cloudwatch.MathExpression({
        expression: '100 - (completed / (completed + 1) * 100)',
        usingMetrics: {
          completed: new cloudwatch.Metric({
            namespace,
            metricName: 'SSEStreamCompleted',
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(10),
            dimensionsMap: {
              Environment: environment
            }
          })
        },
        period: cdk.Duration.minutes(10)
      }),
      threshold: 10, // Alert if failure rate > 10%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    this.alarms.streamFailures.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic))

    // ========================================================================
    // DASHBOARD WIDGETS (if dashboard provided)
    // ========================================================================
    if (dashboard) {
      this.addDashboardWidgets(dashboard, namespace, environment)
    }
  }

  /**
   * Add SSE streaming widgets to the dashboard
   */
  private addDashboardWidgets(
    dashboard: cloudwatch.Dashboard,
    namespace: string,
    environment: string
  ): void {
    // Title widget for SSE Streaming section
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `## SSE Streaming Health

Monitor Server-Sent Events streaming for field mismatches, parse errors, and unknown event types.
**Critical:** Field mismatches indicate SDK version compatibility issues (see [#355](https://github.com/psd401/aistudio.psd401.ai/issues/355))`,
        width: 24,
        height: 2
      })
    )

    // Error metrics row
    dashboard.addWidgets(
      // Field mismatches (most critical)
      new cloudwatch.GraphWidget({
        title: 'SSE Field Mismatches (Critical)',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSEFieldMismatches',
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Field Mismatches',
            color: cloudwatch.Color.RED
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Count',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      }),

      // Parse errors
      new cloudwatch.GraphWidget({
        title: 'SSE Parse Errors',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSEParseErrors',
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Parse Errors',
            color: cloudwatch.Color.ORANGE
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Count',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      }),

      // Unknown event types
      new cloudwatch.GraphWidget({
        title: 'Unknown Event Types',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSEUnknownEvents',
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Unknown Events',
            color: cloudwatch.Color.BLUE
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Count',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      })
    )

    // Performance metrics row
    dashboard.addWidgets(
      // Stream volume
      new cloudwatch.GraphWidget({
        title: 'SSE Stream Volume',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSETotalEvents',
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Total Events',
            color: cloudwatch.Color.GREEN
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Events',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      }),

      // Stream duration
      new cloudwatch.GraphWidget({
        title: 'SSE Stream Duration',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSEStreamDuration',
            statistic: cloudwatch.Stats.AVERAGE,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Avg Duration (ms)',
            color: cloudwatch.Color.PURPLE
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      }),

      // Throughput
      new cloudwatch.GraphWidget({
        title: 'SSE Throughput',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SSEEventsPerSecond',
            statistic: cloudwatch.Stats.AVERAGE,
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Environment: environment },
            label: 'Events/Second',
            color: cloudwatch.Color.BROWN
          })
        ],
        leftYAxis: {
          min: 0,
          label: 'Events per Second',
          showUnits: false
        },
        legendPosition: cloudwatch.LegendPosition.BOTTOM
      })
    )

    // Alarm status row
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'SSE Streaming Alarms',
        width: 24,
        height: 3,
        alarms: [
          this.alarms.fieldMismatch,
          this.alarms.parseErrors,
          this.alarms.unknownEvents,
          this.alarms.streamFailures
        ]
      })
    )
  }

  /**
   * Create a standalone dashboard for SSE streaming monitoring
   * Use this if you want a dedicated dashboard instead of adding to main dashboard
   */
  public static createStandaloneDashboard(
    scope: Construct,
    id: string,
    props: SSEStreamingMonitoringProps
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(scope, id, {
      dashboardName: `${props.environment}-SSE-Streaming-Monitoring`,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO
    })

    // Create monitoring construct with this dashboard
    new SSEStreamingMonitoring(scope, `${id}Monitoring`, {
      ...props,
      dashboard
    })

    return dashboard
  }
}
