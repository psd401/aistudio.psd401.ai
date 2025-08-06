import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface MonitoringStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  alertEmail?: string;
  amplifyAppId?: string; // Optional - will read from SSM if not provided
}

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alarmTopic: sns.Topic;
  
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment } = props;
    
    // Get Amplify app ID from props or SSM Parameter Store
    const amplifyAppId = props.amplifyAppId || 
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${environment}/amplify-app-id`
      );
    
    // Construct the actual log group name using the app ID
    const amplifyLogGroupName = `/aws/amplify/${amplifyAppId}`;

    // Create SNS topic for alarms
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `aistudio-${environment}-monitoring-alarms`,
      displayName: `AI Studio ${environment.toUpperCase()} Monitoring Alarms`,
    });

    // Add email subscription if provided
    if (props.alertEmail) {
      this.alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create the main dashboard with modern configuration
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `AIStudio-${environment}-Monitoring`,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Add title widget
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# AI Studio ${environment.toUpperCase()} Monitoring Dashboard
        
**Environment:** ${environment}  
**Region:** ${this.region}  
**Last Updated:** Dashboard auto-refreshes every 5 minutes`,
        width: 24,
        height: 2,
      })
    );

    // Overview metrics row
    this.dashboard.addWidgets(
      this.createRequestVolumeWidget(environment),
      this.createErrorRateWidget(environment),
      this.createLatencyWidget(environment),
      this.createActiveUsersWidget(environment)
    );

    // Log Insights queries row
    this.dashboard.addWidgets(
      this.createRecentErrorsWidget(amplifyLogGroupName),
      this.createSlowOperationsWidget(amplifyLogGroupName)
    );

    // System health row
    this.dashboard.addWidgets(
      this.createLambdaMetricsWidget(environment),
      this.createDatabaseMetricsWidget(environment)
    );

    // User activity row
    this.dashboard.addWidgets(
      this.createUserActivityWidget(amplifyLogGroupName),
      this.createAuthMetricsWidget(amplifyLogGroupName)
    );

    // Business metrics row
    this.dashboard.addWidgets(
      this.createBusinessMetricsWidget(environment)
    );

    // Add CloudWatch Insights queries reference
    this.dashboard.addWidgets(
      this.createInsightQueriesWidget(amplifyLogGroupName)
    );

    // Create alarms
    this.createAlarms(environment);

    // Output dashboard URL
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `${environment}-MonitoringDashboardURL`,
    });

    // Output alarm topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic for monitoring alarms',
      exportName: `${environment}-MonitoringAlarmTopicArn`,
    });
  }

  private createRequestVolumeWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Request Volume',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Amplify',
          metricName: 'Requests',
          dimensionsMap: {
            App: `aistudio-${environment}`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
      leftYAxis: {
        min: 0,
      },
    });
  }

  private createErrorRateWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Error Rate (%)',
      left: [
        new cloudwatch.MathExpression({
          expression: '(m4xx / mreq4xx) * 100',
          usingMetrics: {
            m4xx: new cloudwatch.Metric({
              namespace: 'AWS/Amplify',
              metricName: '4XXError',
              dimensionsMap: {
                App: `aistudio-${environment}`,
              },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
            mreq4xx: new cloudwatch.Metric({
              namespace: 'AWS/Amplify',
              metricName: 'Requests',
              dimensionsMap: {
                App: `aistudio-${environment}`,
              },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          },
          label: '4XX Error Rate',
          color: '#ff9900',
        }),
        new cloudwatch.MathExpression({
          expression: '(m5xx / mreq5xx) * 100',
          usingMetrics: {
            m5xx: new cloudwatch.Metric({
              namespace: 'AWS/Amplify',
              metricName: '5XXError',
              dimensionsMap: {
                App: `aistudio-${environment}`,
              },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
            mreq5xx: new cloudwatch.Metric({
              namespace: 'AWS/Amplify',
              metricName: 'Requests',
              dimensionsMap: {
                App: `aistudio-${environment}`,
              },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          },
          label: '5XX Error Rate',
          color: '#d13212',
        }),
      ],
      width: 6,
      height: 6,
      leftYAxis: {
        min: 0,
        max: 100,
      },
    });
  }

  private createLatencyWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Response Time Percentiles',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Amplify',
          metricName: 'Latency',
          dimensionsMap: {
            App: `aistudio-${environment}`,
          },
          statistic: 'p50',
          period: cdk.Duration.minutes(5),
          label: 'P50',
          color: '#2ca02c',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Amplify',
          metricName: 'Latency',
          dimensionsMap: {
            App: `aistudio-${environment}`,
          },
          statistic: 'p90',
          period: cdk.Duration.minutes(5),
          label: 'P90',
          color: '#ff9900',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Amplify',
          metricName: 'Latency',
          dimensionsMap: {
            App: `aistudio-${environment}`,
          },
          statistic: 'p99',
          period: cdk.Duration.minutes(5),
          label: 'P99',
          color: '#d13212',
        }),
      ],
      width: 6,
      height: 6,
      leftYAxis: {
        min: 0,
        label: 'Milliseconds',
      },
    });
  }

  private createActiveUsersWidget(environment: string): cloudwatch.SingleValueWidget {
    return new cloudwatch.SingleValueWidget({
      title: 'Active Users (Last Hour)',
      metrics: [
        new cloudwatch.Metric({
          namespace: 'AWS/Amplify',
          metricName: 'ActiveUsers',
          dimensionsMap: {
            App: `aistudio-${environment}`,
          },
          statistic: 'SampleCount',
          period: cdk.Duration.hours(1),
        }),
      ],
      width: 6,
      height: 6,
      sparkline: true,
    });
  }

  private createRecentErrorsWidget(logGroupName: string): cloudwatch.LogQueryWidget {
    return new cloudwatch.LogQueryWidget({
      title: 'Recent Errors',
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
    });
  }

  private createSlowOperationsWidget(logGroupName: string): cloudwatch.LogQueryWidget {
    return new cloudwatch.LogQueryWidget({
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
    });
  }

  private createLambdaMetricsWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Lambda Function Health',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: {
            FunctionName: `aistudio-${environment}-file-processor`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'File Processor Invocations',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: {
            FunctionName: `aistudio-${environment}-file-processor`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'File Processor Errors',
          color: '#d13212',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: {
            FunctionName: `aistudio-${environment}-file-processor`,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Avg Duration (ms)',
          color: '#ff9900',
        }),
      ],
      width: 12,
      height: 6,
      leftYAxis: {
        min: 0,
      },
      rightYAxis: {
        min: 0,
        label: 'Duration (ms)',
      },
    });
  }

  private createDatabaseMetricsWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Database Performance',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'ServerlessDatabaseCapacity',
          dimensionsMap: {
            DBClusterIdentifier: `aistudio-${environment}`,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ACU Usage',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'ACUUtilization',
          dimensionsMap: {
            DBClusterIdentifier: `aistudio-${environment}`,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ACU Utilization %',
          color: '#ff9900',
        }),
      ],
      width: 12,
      height: 6,
      leftYAxis: {
        min: 0,
        label: 'ACUs',
      },
      rightYAxis: {
        min: 0,
        max: 100,
        label: 'Utilization %',
      },
    });
  }

  private createUserActivityWidget(logGroupName: string): cloudwatch.LogQueryWidget {
    return new cloudwatch.LogQueryWidget({
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
    });
  }

  private createAuthMetricsWidget(logGroupName: string): cloudwatch.LogQueryWidget {
    return new cloudwatch.LogQueryWidget({
      title: 'Authentication Events',
      logGroupNames: [logGroupName],
      view: cloudwatch.LogQueryVisualizationType.PIE,
      queryLines: [
        'fields action',
        'filter action like /auth/',
        'stats count() by action',
      ],
      width: 12,
      height: 6,
      region: this.region,
    });
  }

  private createBusinessMetricsWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Business Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: {
            QueueName: `aistudio-${environment}-file-processing-queue`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Files Queued',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesDeleted',
          dimensionsMap: {
            QueueName: `aistudio-${environment}-file-processing-queue`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Files Processed',
          color: '#2ca02c',
        }),
      ],
      width: 24,
      height: 6,
      leftYAxis: {
        min: 0,
      },
    });
  }

  private createInsightQueriesWidget(logGroupName: string): cloudwatch.TextWidget {
    return new cloudwatch.TextWidget({
      markdown: `## Useful CloudWatch Insights Queries

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

[Open CloudWatch Insights](https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:logs-insights?queryDetail=~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'fields*20*40timestamp*2c*20level*2c*20message*2c*20requestId*2c*20error.code*0a*7c*20filter*20level*20*3d*20*22error*22*0a*7c*20sort*20*40timestamp*20desc*0a*7c*20limit*20100~source~'${encodeURIComponent(logGroupName)}))`,
      width: 24,
      height: 8,
    });
  }

  private createAlarms(environment: string): void {
    // High error rate alarm
    const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', {
      alarmName: `${environment}-high-error-rate`,
      alarmDescription: 'Error rate exceeds 5% for 10 minutes',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / requests) * 100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace: 'AWS/Amplify',
            metricName: '5XXError',
            dimensionsMap: {
              App: `aistudio-${environment}`,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          requests: new cloudwatch.Metric({
            namespace: 'AWS/Amplify',
            metricName: 'Requests',
            dimensionsMap: {
              App: `aistudio-${environment}`,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // High latency alarm
    const latencyAlarm = new cloudwatch.Alarm(this, 'HighLatency', {
      alarmName: `${environment}-high-latency`,
      alarmDescription: 'P99 latency exceeds 3 seconds',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Amplify',
        metricName: 'Latency',
        dimensionsMap: {
          App: `aistudio-${environment}`,
        },
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3000,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

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
    const alarms = [errorRateAlarm, latencyAlarm, dbUtilizationAlarm, lambdaErrorsAlarm, dlqAlarm];
    alarms.forEach(alarm => {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
    });

    // Add alarm status widget to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms,
        width: 24,
        height: 3,
        sortBy: cloudwatch.AlarmStatusWidgetSortBy.STATE_UPDATED_TIMESTAMP,
      })
    );
  }
}