import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import {
  LambdaMetrics,
  ECSMetrics,
  AuroraMetrics,
  StorageMetrics,
  NetworkMetrics,
  CostMetrics,
  APIMetrics,
} from './metrics-types';

export interface WidgetOptions {
  width?: number;
  height?: number;
  region?: string;
}

/**
 * Standard widget properties for consistent styling
 */
const STANDARD_WIDGET_PROPS = {
  setPeriodToTimeRange: false,
};

/**
 * Dashboard Widget Factory
 *
 * Provides standardized widget creation methods for consolidated dashboards.
 * All widgets follow consistent sizing, styling, and naming conventions.
 */
export class DashboardWidgetFactory {
  /**
   * Create a cost tracking widget
   */
  static createCostWidget(
    title: string,
    metrics: cloudwatch.IMetric[],
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title,
      left: metrics,
      leftYAxis: { label: 'Cost ($)', min: 0 },
      width: options?.width ?? 8,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create a performance metrics widget with percentile tracking
   */
  static createPerformanceWidget(
    title: string,
    p50?: cloudwatch.IMetric,
    p90?: cloudwatch.IMetric,
    p99?: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    const metrics: cloudwatch.IMetric[] = [];

    if (p50) {
      metrics.push(p50);
    }
    if (p90) {
      metrics.push(p90);
    }
    if (p99) {
      metrics.push(p99);
    }

    return new cloudwatch.GraphWidget({
      title,
      left: metrics,
      leftYAxis: { label: 'Latency (ms)', min: 0 },
      width: options?.width ?? 8,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create a Lambda function health widget
   */
  static createLambdaHealthWidget(
    functionName: string,
    metrics: LambdaMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: `${functionName} - Health`,
      left: [metrics.invocations],
      right: [metrics.errors, ...(metrics.throttles ? [metrics.throttles] : [])],
      leftYAxis: { label: 'Invocations', min: 0 },
      rightYAxis: { label: 'Errors/Throttles', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create a Lambda duration widget
   */
  static createLambdaDurationWidget(
    functionName: string,
    duration: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: `${functionName} - Duration`,
      left: [duration],
      leftYAxis: { label: 'Duration (ms)', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create Lambda cost widget
   */
  static createLambdaCostWidget(
    functionName: string,
    estimatedCost: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.SingleValueWidget {
    return new cloudwatch.SingleValueWidget({
      title: `${functionName} - Est. Cost`,
      metrics: [estimatedCost],
      width: options?.width ?? 6,
      height: options?.height ?? 4,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create ECS service health widget
   */
  static createECSHealthWidget(
    serviceName: string,
    metrics: ECSMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: `${serviceName} - Health`,
      left: [metrics.cpuUtilization, metrics.memoryUtilization],
      right: [metrics.runningTasks],
      leftYAxis: { label: 'Utilization (%)', min: 0, max: 100 },
      rightYAxis: { label: 'Tasks', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create Aurora database widget
   */
  static createAuroraWidget(
    metrics: AuroraMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Aurora Database - Capacity & Utilization',
      left: [metrics.capacity],
      right: [metrics.acuUtilization],
      leftYAxis: { label: 'ACU', min: 0 },
      rightYAxis: { label: 'Utilization (%)', min: 0, max: 100 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create Aurora connections widget
   */
  static createAuroraConnectionsWidget(
    connections: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Aurora Database - Connections',
      left: [connections],
      leftYAxis: { label: 'Connections', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create Aurora cost widget
   */
  static createAuroraCostWidget(
    estimatedCost: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.SingleValueWidget {
    return new cloudwatch.SingleValueWidget({
      title: 'Aurora - Est. Monthly Cost',
      metrics: [estimatedCost],
      width: options?.width ?? 6,
      height: options?.height ?? 4,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create S3 storage widget
   */
  static createStorageWidget(
    bucketName: string,
    metrics: StorageMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: `${bucketName} - Storage`,
      left: [metrics.bucketSize],
      right: [metrics.objectCount],
      leftYAxis: { label: 'Size (Bytes)', min: 0 },
      rightYAxis: { label: 'Objects', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create S3 request metrics widget
   */
  static createS3RequestWidget(
    bucketName: string,
    getRequests: cloudwatch.IMetric,
    putRequests: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: `${bucketName} - Requests`,
      left: [getRequests, putRequests],
      leftYAxis: { label: 'Requests', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create VPC network widget
   */
  static createNetworkWidget(
    metrics: NetworkMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    const leftMetrics: cloudwatch.IMetric[] = [];
    if (metrics.bytesIn) leftMetrics.push(metrics.bytesIn);
    if (metrics.bytesOut) leftMetrics.push(metrics.bytesOut);

    return new cloudwatch.GraphWidget({
      title: 'Network Traffic',
      left: leftMetrics,
      leftYAxis: { label: 'Bytes', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create NAT Gateway widget
   */
  static createNATGatewayWidget(
    natMetrics: NetworkMetrics['natGatewayMetrics'],
    options?: WidgetOptions
  ): cloudwatch.GraphWidget | null {
    if (!natMetrics) return null;

    return new cloudwatch.GraphWidget({
      title: 'NAT Gateway - Traffic',
      left: [natMetrics.bytesOutToDestination, natMetrics.bytesInFromDestination],
      right: [natMetrics.activeConnectionCount],
      leftYAxis: { label: 'Bytes', min: 0 },
      rightYAxis: { label: 'Connections', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create API metrics widget
   */
  static createAPIMetricsWidget(
    metrics: APIMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'API - Requests & Errors',
      left: [metrics.requestCount],
      right: [metrics.errorCount],
      leftYAxis: { label: 'Requests', min: 0 },
      rightYAxis: { label: 'Errors', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create error rate widget
   */
  static createErrorRateWidget(
    errorMetric: cloudwatch.IMetric,
    requestMetric: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    const errorRateExpression = new cloudwatch.MathExpression({
      expression: '(errors / requests) * 100',
      usingMetrics: {
        errors: errorMetric,
        requests: requestMetric,
      },
      label: 'Error Rate (%)',
      color: cloudwatch.Color.RED,
    });

    return new cloudwatch.GraphWidget({
      title: 'Error Rate',
      left: [errorRateExpression],
      leftYAxis: { label: 'Percent', min: 0, max: 100 },
      width: options?.width ?? 8,
      height: options?.height ?? 6,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create uptime widget (SLO)
   */
  static createUptimeWidget(
    errorMetric: cloudwatch.IMetric,
    requestMetric: cloudwatch.IMetric,
    options?: WidgetOptions
  ): cloudwatch.SingleValueWidget {
    const uptimeExpression = new cloudwatch.MathExpression({
      expression: '100 - (errors / requests) * 100',
      usingMetrics: {
        errors: errorMetric,
        requests: requestMetric,
      },
      label: 'Uptime (%)',
      color: cloudwatch.Color.GREEN,
    });

    return new cloudwatch.SingleValueWidget({
      title: 'System Uptime (SLO)',
      metrics: [uptimeExpression],
      width: options?.width ?? 6,
      height: options?.height ?? 4,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create total cost widget
   */
  static createTotalCostWidget(
    costMetrics: CostMetrics,
    options?: WidgetOptions
  ): cloudwatch.SingleValueWidget {
    if (!costMetrics.totalEstimatedCost) {
      throw new Error('Total estimated cost metric is required');
    }

    return new cloudwatch.SingleValueWidget({
      title: 'Total Est. Monthly Cost',
      metrics: [costMetrics.totalEstimatedCost],
      width: options?.width ?? 6,
      height: options?.height ?? 4,
      region: options?.region,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create cost breakdown widget
   */
  static createCostBreakdownWidget(
    costMetrics: CostMetrics,
    options?: WidgetOptions
  ): cloudwatch.GraphWidget {
    const metrics: cloudwatch.IMetric[] = [];

    if (costMetrics.lambdaCost) metrics.push(costMetrics.lambdaCost);
    if (costMetrics.auroraCost) metrics.push(costMetrics.auroraCost);
    if (costMetrics.s3Cost) metrics.push(costMetrics.s3Cost);
    if (costMetrics.ecsCost) metrics.push(costMetrics.ecsCost);

    return new cloudwatch.GraphWidget({
      title: 'Cost Breakdown by Service',
      left: metrics,
      leftYAxis: { label: 'Cost ($)', min: 0 },
      width: options?.width ?? 12,
      height: options?.height ?? 6,
      region: options?.region,
      legendPosition: cloudwatch.LegendPosition.RIGHT,
      ...STANDARD_WIDGET_PROPS,
    });
  }

  /**
   * Create section header widget
   */
  static createSectionHeader(
    title: string,
    description?: string,
    options?: WidgetOptions
  ): cloudwatch.TextWidget {
    let markdown = `## ${title}`;
    if (description) {
      markdown += `\n\n${description}`;
    }

    return new cloudwatch.TextWidget({
      markdown,
      width: options?.width ?? 24,
      height: options?.height ?? 1,
    });
  }

  /**
   * Create title widget for dashboard
   */
  static createDashboardTitle(
    title: string,
    environment: string,
    description: string,
    options?: WidgetOptions
  ): cloudwatch.TextWidget {
    return new cloudwatch.TextWidget({
      markdown: `# ${title} - ${environment.toUpperCase()}

${description}

**Auto-refresh:** Every 1 minute`,
      width: options?.width ?? 24,
      height: options?.height ?? 2,
    });
  }
}
