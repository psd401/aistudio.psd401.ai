import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';
import { Construct } from 'constructs';

export interface CostMonitorProps {
  /** Environment name */
  environment: string;
  /** Email address for cost alerts (optional) */
  alertEmail?: string;
  /** Schedule for cost analysis (default: weekly) */
  schedule?: events.Schedule;
  /** Threshold for sending alerts (default: $100) */
  alertThreshold?: number;
}

/**
 * S3 Cost Monitoring construct
 *
 * Deploys a Lambda function that periodically analyzes S3 costs,
 * generates optimization recommendations, and sends alerts
 */
export class CostMonitor extends Construct {
  public readonly analyzer: lambda.Function;
  public readonly topic?: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: CostMonitorProps) {
    super(scope, id);

    // Create SNS topic for alerts if email is provided
    if (props.alertEmail) {
      this.topic = new sns.Topic(this, 'CostAlertTopic', {
        displayName: `S3 Cost Alerts - ${props.environment}`,
        topicName: `aistudio-s3-cost-alerts-${props.environment}`,
      });

      this.topic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }

    // Create Lambda function for cost analysis
    this.analyzer = new lambda.Function(this, 'CostAnalyzer', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'cost-analyzer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        ENVIRONMENT: props.environment,
        ...(this.topic && { SNS_TOPIC_ARN: this.topic.topicArn }),
        ALERT_THRESHOLD: (props.alertThreshold ?? 100).toString(),
      },
      description: `S3 cost analyzer for ${props.environment}`,
    });

    // Grant permissions to Cost Explorer
    this.analyzer.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ce:GetCostAndUsage', 'ce:GetCostForecast'],
        resources: ['*'],
      })
    );

    // Grant permissions to S3 for inventory and metrics
    this.analyzer.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:ListAllMyBuckets',
          's3:GetBucketLocation',
          's3:GetBucketTagging',
          's3:GetInventoryConfiguration',
          's3:GetMetricsConfiguration',
        ],
        resources: ['*'],
      })
    );

    // Grant permissions to CloudWatch
    this.analyzer.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'AIStudio/S3Optimization',
          },
        },
      })
    );

    // Grant permissions to SNS if topic exists
    if (this.topic) {
      this.topic.grantPublish(this.analyzer);
    }

    // Schedule the analyzer to run periodically
    const rule = new events.Rule(this, 'AnalyzerSchedule', {
      schedule: props.schedule ?? events.Schedule.cron({ weekDay: '1', hour: '9', minute: '0' }), // Every Monday at 9:00 AM
      description: `S3 cost analysis schedule for ${props.environment}`,
    });

    rule.addTarget(new targets.LambdaFunction(this.analyzer));

    // Create CloudWatch Dashboard for cost metrics
    this.dashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `S3-Cost-${props.environment}`,
    });

    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# S3 Cost Monitoring - ${props.environment}\n\nAutomated cost analysis and optimization recommendations`,
        width: 24,
        height: 2,
      })
    );

    this.dashboard.addWidgets(
      this.createTotalCostWidget(),
      this.createPotentialSavingsWidget(),
      this.createStorageClassCostWidget()
    );

    this.dashboard.addWidgets(
      this.createCostTrendWidget(),
      this.createSavingsOpportunitiesWidget()
    );
  }

  /**
   * Create widget for total S3 cost
   */
  private createTotalCostWidget(): cloudwatch.SingleValueWidget {
    return new cloudwatch.SingleValueWidget({
      title: 'Current Monthly Cost',
      width: 8,
      height: 6,
      metrics: [
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3TotalCost',
          statistic: 'Average',
          label: 'Total Cost',
          period: cdk.Duration.days(1),
        }),
      ],
      setPeriodToTimeRange: true,
    });
  }

  /**
   * Create widget for potential savings
   */
  private createPotentialSavingsWidget(): cloudwatch.SingleValueWidget {
    return new cloudwatch.SingleValueWidget({
      title: 'Potential Monthly Savings',
      width: 8,
      height: 6,
      metrics: [
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3PotentialSavings',
          statistic: 'Average',
          label: 'Potential Savings',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.GREEN,
        }),
      ],
      setPeriodToTimeRange: true,
    });
  }

  /**
   * Create widget for storage class costs
   */
  private createStorageClassCostWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Cost by Storage Class',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3CostStandard',
          statistic: 'Average',
          label: 'Standard',
          period: cdk.Duration.days(1),
        }),
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3CostIntelligent-Tiering',
          statistic: 'Average',
          label: 'Intelligent-Tiering',
          period: cdk.Duration.days(1),
        }),
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3CostGlacierInstantRetrieval',
          statistic: 'Average',
          label: 'Glacier IR',
          period: cdk.Duration.days(1),
        }),
      ],
      stacked: true,
    });
  }

  /**
   * Create widget for cost trend
   */
  private createCostTrendWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Cost Trend (30 Days)',
      width: 12,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AIStudio/S3Optimization',
          metricName: 'S3TotalCost',
          statistic: 'Average',
          label: 'Total Cost',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.BLUE,
        }),
      ],
    });
  }

  /**
   * Create widget for savings opportunities text
   */
  private createSavingsOpportunitiesWidget(): cloudwatch.TextWidget {
    return new cloudwatch.TextWidget({
      markdown: `## Cost Optimization Opportunities

### Automated Analysis
This dashboard is powered by automated cost analysis that runs weekly.

### Key Recommendations:
1. **Lifecycle Policies**: Ensure all buckets have appropriate lifecycle rules
2. **Intelligent-Tiering**: Enable for objects with unpredictable access patterns
3. **CloudFront**: Use CDN to reduce data transfer costs
4. **Storage Class Review**: Regularly review and optimize storage class usage

### Alerts
Cost alerts are sent when potential savings exceed the configured threshold.
Check your email for detailed recommendations.`,
      width: 12,
      height: 6,
    });
  }

  /**
   * Manually trigger the cost analyzer
   */
  public triggerAnalysis(): void {
    // This would be used in tests or manual invocations
    new events.Rule(this, 'ManualTrigger', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      enabled: false,
      targets: [new targets.LambdaFunction(this.analyzer)],
    });
  }
}
