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
