import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import {
  ConsolidatedMetrics,
  DashboardFeatureFlags,
} from './metrics-types';
import { DashboardWidgetFactory } from './dashboard-widget-factory';

export interface ObservabilityDashboardsProps {
  environment: 'dev' | 'prod';
  amplifyAppId?: string;
  /**
   * Additional metrics from infrastructure stacks for consolidated dashboards
   */
  consolidatedMetrics?: ConsolidatedMetrics;
  /**
   * Feature flags for dashboard migration control
   */
  featureFlags?: DashboardFeatureFlags;
}

/**
 * Observability Dashboards
 * Creates comprehensive dashboards for monitoring AI Studio
 */
export class ObservabilityDashboards extends Construct {
  public readonly serviceDashboard: cloudwatch.Dashboard;
  public readonly executiveDashboard: cloudwatch.Dashboard;
  public readonly costDashboard?: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityDashboardsProps) {
    super(scope, id);

    const { environment, consolidatedMetrics, featureFlags } = props;

    // Default feature flags
    const flags: DashboardFeatureFlags = {
      enableConsolidatedDashboards: featureFlags?.enableConsolidatedDashboards ?? true,
      keepLegacyDashboards: featureFlags?.keepLegacyDashboards ?? false,
      enableCostDashboard: featureFlags?.enableCostDashboard ?? true,
      enableDeepDiveDashboards: featureFlags?.enableDeepDiveDashboards ?? false,
    };

    // Create service-level dashboard (renamed to Operations in consolidated mode)
    this.serviceDashboard = flags.enableConsolidatedDashboards
      ? this.createOperationsDashboard(environment, consolidatedMetrics)
      : this.createServiceDashboard(environment);

    // Create executive dashboard
    this.executiveDashboard = flags.enableConsolidatedDashboards
      ? this.createEnhancedExecutiveDashboard(environment, consolidatedMetrics)
      : this.createExecutiveDashboard(environment);

    // Create cost dashboard if enabled
    if (flags.enableCostDashboard && consolidatedMetrics?.cost) {
      this.costDashboard = this.createCostDashboard(environment, consolidatedMetrics);
    }

    // Output dashboard URLs
    new cdk.CfnOutput(this, 'ServiceDashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.serviceDashboard.dashboardName}`,
      description: 'Service Dashboard URL',
      exportName: `${environment}-ServiceDashboardURL`,
    });

    new cdk.CfnOutput(this, 'ExecutiveDashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.executiveDashboard.dashboardName}`,
      description: 'Executive Dashboard URL',
      exportName: `${environment}-ExecutiveDashboardURL`,
    });
  }

  /**
   * Create service-level dashboard with detailed metrics
   */
  private createServiceDashboard(environment: string): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ServiceDashboard', {
      dashboardName: `AIStudio-${environment}-Service`,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Title
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# AI Studio ${environment.toUpperCase()} - Service Dashboard

**Environment:** ${environment}
**Region:** ${cdk.Stack.of(this).region}
**Auto-refresh:** Every 1 minute`,
        width: 24,
        height: 2,
      })
    );

    // Row 1: Key Request Metrics
    dashboard.addWidgets(
      this.createRequestRateWidget(environment),
      this.createErrorRateWidget(environment),
      this.createLatencyWidget(environment)
    );

    // Row 2: Infrastructure Health
    dashboard.addWidgets(
      this.createLambdaHealthWidget(environment),
      this.createDatabaseHealthWidget(environment)
    );

    // Row 3: Application Performance
    dashboard.addWidgets(this.createCPUWidget(), this.createMemoryWidget(), this.createNetworkWidget());

    // Row 4: Business Metrics
    dashboard.addWidgets(this.createBusinessMetricsWidget(environment));

    return dashboard;
  }

  /**
   * Create executive dashboard with high-level KPIs
   */
  private createExecutiveDashboard(environment: string): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ExecutiveDashboard', {
      dashboardName: `AIStudio-${environment}-Executive`,
      defaultInterval: cdk.Duration.hours(24),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# AI Studio ${environment.toUpperCase()} - Executive Dashboard
## System Health Overview
**Last Updated:** Auto-refreshes every 5 minutes`,
        width: 24,
        height: 2,
      })
    );

    // KPI Row
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'System Uptime (%)',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '100 - (errors / requests) * 100',
            usingMetrics: {
              errors: new cloudwatch.Metric({
                namespace: `AIStudio/${environment}`,
                metricName: 'error_count',
                statistic: 'Sum',
                period: cdk.Duration.days(1),
              }),
              requests: new cloudwatch.Metric({
                namespace: `AIStudio/${environment}`,
                metricName: 'request_count',
                statistic: 'Sum',
                period: cdk.Duration.days(1),
              }),
            },
            label: 'Uptime',
          }),
        ],
        width: 6,
        height: 4,
        setPeriodToTimeRange: true,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Requests (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: `AIStudio/${environment}`,
            metricName: 'request_count',
            statistic: 'Sum',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 6,
        height: 4,
        setPeriodToTimeRange: true,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Avg Response Time (ms)',
        metrics: [
          new cloudwatch.Metric({
            namespace: `AIStudio/${environment}`,
            metricName: 'latency_avg',
            statistic: 'Average',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 6,
        height: 4,
        setPeriodToTimeRange: true,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Error Rate (%)',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '(errors / requests) * 100',
            usingMetrics: {
              errors: new cloudwatch.Metric({
                namespace: `AIStudio/${environment}`,
                metricName: 'error_count',
                statistic: 'Sum',
                period: cdk.Duration.days(1),
              }),
              requests: new cloudwatch.Metric({
                namespace: `AIStudio/${environment}`,
                metricName: 'request_count',
                statistic: 'Sum',
                period: cdk.Duration.days(1),
              }),
            },
          }),
        ],
        width: 6,
        height: 4,
        setPeriodToTimeRange: true,
      })
    );

    return dashboard;
  }

  private createRequestRateWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Request Rate',
      left: [
        new cloudwatch.Metric({
          namespace: `AIStudio/${environment}`,
          metricName: 'request_count',
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: 'Requests/min',
        }),
      ],
      width: 8,
      height: 6,
      leftYAxis: { min: 0 },
    });
  }

  private createErrorRateWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Error Rate (%)',
      left: [
        new cloudwatch.MathExpression({
          expression: '(errors / requests) * 100',
          usingMetrics: {
            errors: new cloudwatch.Metric({
              namespace: `AIStudio/${environment}`,
              metricName: 'error_count',
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
            requests: new cloudwatch.Metric({
              namespace: `AIStudio/${environment}`,
              metricName: 'request_count',
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          },
          label: 'Error Rate',
          color: cloudwatch.Color.RED,
        }),
      ],
      width: 8,
      height: 6,
      leftYAxis: { min: 0, max: 100 },
    });
  }

  private createLatencyWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Latency Percentiles',
      left: [
        new cloudwatch.Metric({
          namespace: `AIStudio/${environment}`,
          metricName: 'latency_p50',
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
          label: 'p50',
          color: cloudwatch.Color.GREEN,
        }),
        new cloudwatch.Metric({
          namespace: `AIStudio/${environment}`,
          metricName: 'latency_p90',
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
          label: 'p90',
          color: cloudwatch.Color.ORANGE,
        }),
        new cloudwatch.Metric({
          namespace: `AIStudio/${environment}`,
          metricName: 'latency_p99',
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
          label: 'p99',
          color: cloudwatch.Color.RED,
        }),
      ],
      width: 8,
      height: 6,
      leftYAxis: { min: 0, label: 'Latency (ms)' },
    });
  }

  private createLambdaHealthWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Lambda Function Health',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: `aistudio-${environment}-*` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Invocations',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `aistudio-${environment}-*` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Errors',
          color: cloudwatch.Color.RED,
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `aistudio-${environment}-*` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Avg Duration',
          color: cloudwatch.Color.ORANGE,
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createDatabaseHealthWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Database Performance',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'ServerlessDatabaseCapacity',
          dimensionsMap: { DBClusterIdentifier: `aistudio-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ACU Usage',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'ACUUtilization',
          dimensionsMap: { DBClusterIdentifier: `aistudio-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ACU Utilization %',
          color: cloudwatch.Color.ORANGE,
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createCPUWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'CPU Utilization',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'CPUUtilization',
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ECS CPU',
        }),
      ],
      width: 8,
      height: 6,
    });
  }

  private createMemoryWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Memory Utilization',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'MemoryUtilization',
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'ECS Memory',
        }),
      ],
      width: 8,
      height: 6,
    });
  }

  private createNetworkWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Network Traffic',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'NetworkRxBytes',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Network In',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'NetworkTxBytes',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Network Out',
        }),
      ],
      width: 8,
      height: 6,
    });
  }

  private createBusinessMetricsWidget(environment: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Business Metrics - File Processing',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: { QueueName: `aistudio-${environment}-file-processing-queue` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Files Queued',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesDeleted',
          dimensionsMap: { QueueName: `aistudio-${environment}-file-processing-queue` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Files Processed',
          color: cloudwatch.Color.GREEN,
        }),
      ],
      width: 24,
      height: 6,
    });
  }

  /**
   * Create consolidated Operations Dashboard with all infrastructure metrics
   */
  private createOperationsDashboard(
    environment: string,
    metrics?: ConsolidatedMetrics
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: `AIStudio-${environment}-Operations`,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Title
    dashboard.addWidgets(
      DashboardWidgetFactory.createDashboardTitle(
        'AI Studio Operations',
        environment,
        'Comprehensive operational metrics for infrastructure health, performance, and cost'
      )
    );

    // System Overview Section
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader(
        'System Overview',
        'High-level health and performance indicators'
      )
    );

    // Add legacy widgets for now (will be replaced with consolidated metrics)
    dashboard.addWidgets(
      this.createRequestRateWidget(environment),
      this.createErrorRateWidget(environment),
      this.createLatencyWidget(environment)
    );

    // Infrastructure Health Section
    if (metrics) {
      this.addInfrastructureHealthSection(dashboard, environment, metrics);
      this.addCostTrackingSection(dashboard, environment, metrics);
      this.addStorageSection(dashboard, environment, metrics);
      this.addNetworkSection(dashboard, environment, metrics);
      this.addSecuritySection(dashboard, environment, metrics);
    }

    // Legacy sections
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Legacy Metrics', 'Application performance metrics')
    );
    dashboard.addWidgets(
      this.createLambdaHealthWidget(environment),
      this.createDatabaseHealthWidget(environment)
    );

    return dashboard;
  }

  /**
   * Create enhanced Executive Dashboard with business KPIs
   */
  private createEnhancedExecutiveDashboard(
    environment: string,
    metrics?: ConsolidatedMetrics
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'EnhancedExecutiveDashboard', {
      dashboardName: `AIStudio-${environment}-Executive`,
      defaultInterval: cdk.Duration.hours(24),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    dashboard.addWidgets(
      DashboardWidgetFactory.createDashboardTitle(
        'AI Studio Executive Dashboard',
        environment,
        'Business KPIs, cost summary, and system health overview'
      )
    );

    // Business KPIs Section
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Business KPIs', 'Key performance indicators')
    );

    // Note: In a full implementation, we'd add legacy executive dashboard widgets here
    // For now, we're using the new structure with consolidated metrics

    // Add cost summary if available
    if (metrics?.cost) {
      dashboard.addWidgets(
        DashboardWidgetFactory.createSectionHeader('Cost Summary', 'Monthly cost tracking and projections')
      );

      if (metrics.cost.totalEstimatedCost) {
        dashboard.addWidgets(
          DashboardWidgetFactory.createTotalCostWidget(metrics.cost, { width: 8, height: 4 })
        );
      }
    }

    return dashboard;
  }

  /**
   * Create Cost & FinOps Dashboard
   */
  private createCostDashboard(
    environment: string,
    metrics: ConsolidatedMetrics
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `AIStudio-${environment}-Cost`,
      defaultInterval: cdk.Duration.hours(24),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    dashboard.addWidgets(
      DashboardWidgetFactory.createDashboardTitle(
        'AI Studio Cost & FinOps',
        environment,
        'Cost tracking, budget monitoring, and financial optimization'
      )
    );

    // Cost Overview Section
    if (metrics.cost) {
      dashboard.addWidgets(
        DashboardWidgetFactory.createSectionHeader('Cost Overview', 'Monthly cost breakdown and trends')
      );

      if (metrics.cost.totalEstimatedCost) {
        dashboard.addWidgets(
          DashboardWidgetFactory.createTotalCostWidget(metrics.cost, { width: 6, height: 4 })
        );
      }

      dashboard.addWidgets(
        DashboardWidgetFactory.createCostBreakdownWidget(metrics.cost, { width: 18, height: 6 })
      );
    }

    // Service-specific cost sections
    if (metrics.aurora?.estimatedCost) {
      dashboard.addWidgets(
        DashboardWidgetFactory.createSectionHeader('Aurora Database Costs', 'Database capacity and cost metrics')
      );
      dashboard.addWidgets(
        DashboardWidgetFactory.createAuroraCostWidget(metrics.aurora.estimatedCost, { width: 6, height: 4 }),
        DashboardWidgetFactory.createAuroraWidget(metrics.aurora, { width: 18, height: 6 })
      );
    }

    return dashboard;
  }

  /**
   * Add Infrastructure Health section to dashboard
   */
  private addInfrastructureHealthSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader(
        'Infrastructure Health',
        'Compute, database, and service health metrics'
      )
    );

    // Lambda metrics
    if (metrics.lambda) {
      Object.entries(metrics.lambda).forEach(([name, lambdaMetrics]) => {
        dashboard.addWidgets(
          DashboardWidgetFactory.createLambdaHealthWidget(name, lambdaMetrics, { width: 12, height: 6 })
        );
      });
    }

    // ECS metrics
    if (metrics.ecs) {
      Object.entries(metrics.ecs).forEach(([name, ecsMetrics]) => {
        dashboard.addWidgets(
          DashboardWidgetFactory.createECSHealthWidget(name, ecsMetrics, { width: 12, height: 6 })
        );
      });
    }

    // Aurora metrics
    if (metrics.aurora) {
      dashboard.addWidgets(
        DashboardWidgetFactory.createAuroraWidget(metrics.aurora, { width: 12, height: 6 }),
        DashboardWidgetFactory.createAuroraConnectionsWidget(metrics.aurora.connections, { width: 12, height: 6 })
      );
    }
  }

  /**
   * Add Cost Tracking section to dashboard
   */
  private addCostTrackingSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    if (!metrics.cost) return;

    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Cost Tracking', 'Real-time cost metrics')
    );

    dashboard.addWidgets(
      DashboardWidgetFactory.createCostBreakdownWidget(metrics.cost, { width: 24, height: 6 })
    );
  }

  /**
   * Add Storage section to dashboard
   */
  private addStorageSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    if (!metrics.storage) return;

    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Storage Analytics', 'S3 bucket metrics and costs')
    );

    Object.entries(metrics.storage).forEach(([bucketName, storageMetrics]) => {
      dashboard.addWidgets(
        DashboardWidgetFactory.createStorageWidget(bucketName, storageMetrics, { width: 12, height: 6 })
      );

      if (storageMetrics.requestMetrics) {
        dashboard.addWidgets(
          DashboardWidgetFactory.createS3RequestWidget(
            bucketName,
            storageMetrics.requestMetrics.getRequests,
            storageMetrics.requestMetrics.putRequests,
            { width: 12, height: 6 }
          )
        );
      }
    });
  }

  /**
   * Add Network section to dashboard
   */
  private addNetworkSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    if (!metrics.network) return;

    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Network Performance', 'VPC and NAT Gateway metrics')
    );

    dashboard.addWidgets(
      DashboardWidgetFactory.createNetworkWidget(metrics.network, { width: 12, height: 6 })
    );

    if (metrics.network.natGatewayMetrics) {
      const natWidget = DashboardWidgetFactory.createNATGatewayWidget(metrics.network.natGatewayMetrics, {
        width: 12,
        height: 6,
      });
      if (natWidget) dashboard.addWidgets(natWidget);
    }
  }

  /**
   * Add Security section to dashboard
   */
  private addSecuritySection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    if (!metrics.security) return;

    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('Security & Compliance', 'Security posture and compliance metrics')
    );

    // Security widgets would be added here based on available metrics
    // This is a placeholder for future security metric integration
  }
}
