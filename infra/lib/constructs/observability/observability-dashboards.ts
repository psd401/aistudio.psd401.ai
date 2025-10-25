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

    // Create consolidated Operations dashboard
    this.serviceDashboard = this.createOperationsDashboard(environment, consolidatedMetrics);

    // Create consolidated Executive dashboard
    this.executiveDashboard = this.createEnhancedExecutiveDashboard(environment, consolidatedMetrics);

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
   * Legacy dashboard methods removed - using consolidated dashboards only
   */

  /**
   * Create consolidated Operations Dashboard with all infrastructure metrics
   */
  private createOperationsDashboard(
    environment: string,
    metrics?: ConsolidatedMetrics
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ServiceDashboard', {
      dashboardName: `AIStudio-${environment}-Service`,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Title
    dashboard.addWidgets(
      DashboardWidgetFactory.createDashboardTitle(
        'AI Studio Service Dashboard',
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

    // Infrastructure Health Section
    if (metrics) {
      this.addInfrastructureHealthSection(dashboard, environment, metrics);
      this.addNextJSApplicationSection(dashboard, environment, metrics);
      this.addAPIPerformanceSection(dashboard, environment, metrics);
      this.addCostTrackingSection(dashboard, environment, metrics);
      this.addStorageSection(dashboard, environment, metrics);
      this.addNetworkSection(dashboard, environment, metrics);
      this.addSecuritySection(dashboard, environment, metrics);
    }

    return dashboard;
  }

  /**
   * Create enhanced Executive Dashboard with business KPIs
   */
  private createEnhancedExecutiveDashboard(
    environment: string,
    metrics?: ConsolidatedMetrics
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ExecutiveDashboard', {
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

    // Business KPIs Section - System Health Overview
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('System Health Overview', 'High-level infrastructure status')
    );

    // Add comprehensive system health widgets
    if (metrics) {
      // Lambda health overview
      if (metrics.lambda) {
        const lambdaFunctions = Object.keys(metrics.lambda);
        dashboard.addWidgets(
          new cloudwatch.TextWidget({
            markdown: `### Lambda Functions\n\n**${lambdaFunctions.length}** active functions\n\n${lambdaFunctions.map(f => `- ${f}`).join('\n')}`,
            width: 6,
            height: 4,
          })
        );

        // Total Lambda invocations across all functions
        const totalInvocations = Object.values(metrics.lambda).map(m => m.invocations);
        if (totalInvocations.length > 0) {
          dashboard.addWidgets(
            new cloudwatch.GraphWidget({
              title: 'Total Lambda Invocations',
              left: totalInvocations,
              width: 9,
              height: 4,
            })
          );
        }

        // Total Lambda errors across all functions
        const totalErrors = Object.values(metrics.lambda).map(m => m.errors);
        if (totalErrors.length > 0) {
          dashboard.addWidgets(
            new cloudwatch.GraphWidget({
              title: 'Total Lambda Errors',
              left: totalErrors,
              width: 9,
              height: 4,
            })
          );
        }
      }

      // ECS health overview
      if (metrics.ecs) {
        Object.entries(metrics.ecs).forEach(([name, ecsMetrics]) => {
          dashboard.addWidgets(
            new cloudwatch.SingleValueWidget({
              title: `${name} - Status`,
              metrics: [ecsMetrics.runningTasks],
              width: 6,
              height: 4,
            })
          );

          dashboard.addWidgets(
            new cloudwatch.GraphWidget({
              title: `${name} - Resource Utilization`,
              left: [ecsMetrics.cpuUtilization, ecsMetrics.memoryUtilization],
              leftYAxis: { min: 0, max: 100 },
              width: 18,
              height: 4,
            })
          );
        });
      }

      // Aurora health overview
      if (metrics.aurora) {
        dashboard.addWidgets(
          new cloudwatch.SingleValueWidget({
            title: 'Database ACU',
            metrics: [metrics.aurora.capacity],
            width: 6,
            height: 4,
          })
        );

        dashboard.addWidgets(
          new cloudwatch.SingleValueWidget({
            title: 'Database Connections',
            metrics: [metrics.aurora.connections],
            width: 6,
            height: 4,
          })
        );

        dashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: 'Database Performance',
            left: [metrics.aurora.acuUtilization, metrics.aurora.cpuUtilization],
            leftYAxis: { min: 0, max: 100 },
            width: 12,
            height: 4,
          })
        );
      }

      // API health overview
      if (metrics.api) {
        dashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: 'API Request Volume',
            left: [metrics.api.requestCount],
            width: 12,
            height: 4,
          })
        );

        dashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: 'API Error Rate',
            left: [
              new cloudwatch.MathExpression({
                expression: '(errors / requests) * 100',
                usingMetrics: {
                  errors: metrics.api.errorCount,
                  requests: metrics.api.requestCount,
                },
                label: 'Error Rate (%)',
              }),
            ],
            leftYAxis: { min: 0, max: 100 },
            width: 12,
            height: 4,
          })
        );
      }

      // Storage overview
      if (metrics.storage) {
        Object.entries(metrics.storage).forEach(([name, storageMetrics]) => {
          dashboard.addWidgets(
            new cloudwatch.SingleValueWidget({
              title: `${name} - Size`,
              metrics: [storageMetrics.bucketSize],
              width: 6,
              height: 4,
            })
          );

          dashboard.addWidgets(
            new cloudwatch.SingleValueWidget({
              title: `${name} - Objects`,
              metrics: [storageMetrics.objectCount],
              width: 6,
              height: 4,
            })
          );
        });
      }
    }

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

      // Cost breakdown by service
      const costMetrics: cloudwatch.IMetric[] = [];
      if (metrics.cost.lambdaCost) costMetrics.push(metrics.cost.lambdaCost);
      if (metrics.cost.auroraCost) costMetrics.push(metrics.cost.auroraCost);
      if (metrics.cost.s3Cost) costMetrics.push(metrics.cost.s3Cost);
      if (metrics.cost.ecsCost) costMetrics.push(metrics.cost.ecsCost);

      if (costMetrics.length > 0) {
        dashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: 'Cost by Service',
            left: costMetrics,
            width: 16,
            height: 6,
          })
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

    // Lambda metrics - create comprehensive monitoring section for each function
    // Layout: Use full 24-unit width with side-by-side widgets
    if (metrics.lambda) {
      Object.entries(metrics.lambda).forEach(([name, lambdaMetrics]) => {
        // Section header for each Lambda function (full width)
        dashboard.addWidgets(
          DashboardWidgetFactory.createSectionHeader(`${name} Metrics`, `Detailed performance monitoring for ${name}`)
        );

        // Row 1: Three main graphs side-by-side (8 units each = 24 total)
        dashboard.addWidgets(
          DashboardWidgetFactory.createLambdaHealthWidget(name, lambdaMetrics, { width: 8, height: 6 }),
          DashboardWidgetFactory.createLambdaDurationWidget(name, lambdaMetrics.duration, { width: 8, height: 6 }),
          lambdaMetrics.concurrentExecutions
            ? new cloudwatch.GraphWidget({
                title: `${name} - Concurrent Executions`,
                left: [lambdaMetrics.concurrentExecutions],
                leftYAxis: { min: 0 },
                width: 8,
                height: 6,
              })
            : new cloudwatch.GraphWidget({
                title: `${name} - Error Rate %`,
                left: [
                  new cloudwatch.MathExpression({
                    expression: '(errors / invocations) * 100',
                    usingMetrics: {
                      errors: lambdaMetrics.errors,
                      invocations: lambdaMetrics.invocations,
                    },
                    label: 'Error Rate',
                  }),
                ],
                leftYAxis: { min: 0, max: 100 },
                width: 8,
                height: 6,
              })
        );

        // Row 2: Four single value widgets side-by-side (6 units each = 24 total)
        const row2Widgets: cloudwatch.IWidget[] = [
          new cloudwatch.SingleValueWidget({
            title: `${name} - Invocations`,
            metrics: [lambdaMetrics.invocations],
            width: 6,
            height: 3,
          }),
          new cloudwatch.SingleValueWidget({
            title: `${name} - Errors`,
            metrics: [lambdaMetrics.errors],
            width: 6,
            height: 3,
          }),
        ];

        if (lambdaMetrics.throttles) {
          row2Widgets.push(
            new cloudwatch.SingleValueWidget({
              title: `${name} - Throttles`,
              metrics: [lambdaMetrics.throttles],
              width: 6,
              height: 3,
            })
          );
        }

        row2Widgets.push(
          new cloudwatch.SingleValueWidget({
            title: `${name} - Avg Duration`,
            metrics: [lambdaMetrics.duration],
            width: 6,
            height: 3,
          })
        );

        dashboard.addWidgets(...row2Widgets);
      });
    }

    // ECS metrics - create comprehensive monitoring section with horizontal layout
    if (metrics.ecs) {
      Object.entries(metrics.ecs).forEach(([name, ecsMetrics]) => {
        // Section header for ECS service (full width)
        dashboard.addWidgets(
          DashboardWidgetFactory.createSectionHeader(`${name} ECS Service`, `Container performance and health metrics`)
        );

        // Row 1: Health overview + CPU graph (12 + 12 = 24)
        dashboard.addWidgets(
          DashboardWidgetFactory.createECSHealthWidget(name, ecsMetrics, { width: 12, height: 6 }),
          new cloudwatch.GraphWidget({
            title: `${name} - CPU Utilization Over Time`,
            left: [ecsMetrics.cpuUtilization],
            leftYAxis: { min: 0, max: 100 },
            width: 12,
            height: 6,
          })
        );

        // Row 2: Memory + Running tasks (12 + 12 = 24)
        dashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: `${name} - Memory Utilization Over Time`,
            left: [ecsMetrics.memoryUtilization],
            leftYAxis: { min: 0, max: 100 },
            width: 12,
            height: 6,
          }),
          new cloudwatch.GraphWidget({
            title: `${name} - Running Tasks`,
            left: [ecsMetrics.runningTasks],
            leftYAxis: { min: 0 },
            width: 12,
            height: 6,
          })
        );

        // Row 3: Single value status widgets (6 + 6 + 6 + 6 = 24)
        const statusWidgets: cloudwatch.IWidget[] = [
          new cloudwatch.SingleValueWidget({
            title: `${name} - CPU %`,
            metrics: [ecsMetrics.cpuUtilization],
            width: 6,
            height: 3,
          }),
          new cloudwatch.SingleValueWidget({
            title: `${name} - Memory %`,
            metrics: [ecsMetrics.memoryUtilization],
            width: 6,
            height: 3,
          }),
          new cloudwatch.SingleValueWidget({
            title: `${name} - Tasks`,
            metrics: [ecsMetrics.runningTasks],
            width: 6,
            height: 3,
          }),
        ];

        // Add request count if available, otherwise add spacer
        if (ecsMetrics.requestCount) {
          statusWidgets.push(
            new cloudwatch.GraphWidget({
              title: `${name} - Request Count`,
              left: [ecsMetrics.requestCount],
              width: 6,
              height: 3,
            })
          );
        }

        dashboard.addWidgets(...statusWidgets);
      });
    }

    // Aurora metrics - comprehensive database monitoring with horizontal layout
    if (metrics.aurora) {
      // Row 1: Capacity + Connections side-by-side (12 + 12 = 24)
      dashboard.addWidgets(
        DashboardWidgetFactory.createAuroraWidget(metrics.aurora, { width: 12, height: 6 }),
        DashboardWidgetFactory.createAuroraConnectionsWidget(metrics.aurora.connections, { width: 12, height: 6 })
      );

      // Row 2: CPU graph full width or split with another metric
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Aurora - CPU Utilization',
          left: [metrics.aurora.cpuUtilization],
          leftYAxis: { label: 'Percent', min: 0, max: 100 },
          width: 24,
          height: 6,
        })
      );

      // Row 3: Four single value widgets (6 + 6 + 6 + 6 = 24)
      dashboard.addWidgets(
        new cloudwatch.SingleValueWidget({
          title: 'Aurora - Current ACU',
          metrics: [metrics.aurora.capacity],
          width: 6,
          height: 4,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'Aurora - ACU Utilization %',
          metrics: [metrics.aurora.acuUtilization],
          width: 6,
          height: 4,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'Aurora - Connections',
          metrics: [metrics.aurora.connections],
          width: 6,
          height: 4,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'Aurora - CPU %',
          metrics: [metrics.aurora.cpuUtilization],
          width: 6,
          height: 4,
        })
      );
    }
  }

  /**
   * Add Next.js Application monitoring section with ALB and HTTP metrics
   */
  private addNextJSApplicationSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader(
        'Next.js Application (ALB + ECS)',
        'Frontend application performance, HTTP response codes, and target health'
      )
    );

    // Row 1: HTTP response codes breakdown (6 + 6 + 6 + 6 = 24)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'HTTP 2XX Responses (Success)',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="HTTPCode_Target_2XX_Count" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: '2XX Count',
            usingMetrics: {},
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'HTTP 3XX Responses (Redirects)',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="HTTPCode_Target_3XX_Count" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: '3XX Count',
            usingMetrics: {},
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'HTTP 4XX Responses (Client Errors)',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="HTTPCode_Target_4XX_Count" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: '4XX Count',
            usingMetrics: {},
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'HTTP 5XX Responses (Server Errors)',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="HTTPCode_Target_5XX_Count" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: '5XX Count',
            usingMetrics: {},
          }),
        ],
        width: 6,
        height: 6,
      })
    );

    // Row 2: Target health and connection metrics (12 + 12 = 24)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Target Health (Healthy vs Unhealthy)',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,TargetGroup,LoadBalancer} MetricName="HealthyHostCount" TargetGroup="*aistudio*"\', \'Average\', 300)',
            label: 'Healthy Targets',
            usingMetrics: {},
          }),
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,TargetGroup,LoadBalancer} MetricName="UnHealthyHostCount" TargetGroup="*aistudio*"\', \'Average\', 300)',
            label: 'Unhealthy Targets',
            usingMetrics: {},
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Connection Metrics',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="ActiveConnectionCount" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: 'Active Connections',
            usingMetrics: {},
          }),
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="NewConnectionCount" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: 'New Connections',
            usingMetrics: {},
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Row 3: Request processing and data transfer (8 + 8 + 8 = 24)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Processed Bytes',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="ProcessedBytes" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: 'Total Bytes',
            usingMetrics: {},
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Rejected Connections',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="RejectedConnectionCount" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: 'Rejected',
            usingMetrics: {},
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Client TLS Negotiation Errors',
        left: [
          new cloudwatch.MathExpression({
            expression:
              'SEARCH(\'{AWS/ApplicationELB,LoadBalancer} MetricName="ClientTLSNegotiationErrorCount" LoadBalancer="*aistudio*"\', \'Sum\', 300)',
            label: 'TLS Errors',
            usingMetrics: {},
          }),
        ],
        width: 8,
        height: 6,
      })
    );

    // Row 4: Single value status widgets (6 + 6 + 6 + 6 = 24)
    if (metrics.api) {
      const statusWidgets: cloudwatch.IWidget[] = [];

      statusWidgets.push(
        new cloudwatch.SingleValueWidget({
          title: 'Current Request Count',
          metrics: [metrics.api.requestCount],
          width: 6,
          height: 4,
        })
      );

      statusWidgets.push(
        new cloudwatch.SingleValueWidget({
          title: 'Error Count',
          metrics: [metrics.api.errorCount],
          width: 6,
          height: 4,
        })
      );

      if (metrics.api.latencyP99) {
        statusWidgets.push(
          new cloudwatch.SingleValueWidget({
            title: 'p99 Latency',
            metrics: [metrics.api.latencyP99],
            width: 6,
            height: 4,
          })
        );
      }

      if (metrics.api.availability) {
        statusWidgets.push(
          new cloudwatch.SingleValueWidget({
            title: 'Healthy Targets',
            metrics: [metrics.api.availability],
            width: 6,
            height: 4,
          })
        );
      }

      if (statusWidgets.length > 0) {
        dashboard.addWidgets(...statusWidgets);
      }
    }
  }

  /**
   * Add API Performance section to dashboard
   */
  private addAPIPerformanceSection(
    dashboard: cloudwatch.Dashboard,
    environment: string,
    metrics: ConsolidatedMetrics
  ): void {
    if (!metrics.api) return;

    dashboard.addWidgets(
      DashboardWidgetFactory.createSectionHeader('API Performance', 'Request latency, throughput, and error rates')
    );

    // Row 1: API metrics + Latency percentiles (12 + 12 = 24)
    dashboard.addWidgets(
      DashboardWidgetFactory.createAPIMetricsWidget(metrics.api, { width: 12, height: 6 }),
      DashboardWidgetFactory.createPerformanceWidget(
        'API Response Time (Percentiles)',
        metrics.api.latencyP50,
        metrics.api.latencyP90,
        metrics.api.latencyP99,
        { width: 12, height: 6 }
      )
    );

    // Row 2: Error rate + Uptime + Total Requests (8 + 8 + 8 = 24)
    dashboard.addWidgets(
      DashboardWidgetFactory.createErrorRateWidget(metrics.api.errorCount, metrics.api.requestCount, {
        width: 8,
        height: 6,
      }),
      DashboardWidgetFactory.createUptimeWidget(metrics.api.errorCount, metrics.api.requestCount, {
        width: 8,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Requests (5min)',
        metrics: [metrics.api.requestCount],
        width: 8,
        height: 6,
      })
    );
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
