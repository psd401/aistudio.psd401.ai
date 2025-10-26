import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

/**
 * Widget priority levels for dashboard consolidation
 *
 * P0 - Critical metrics that must always be visible
 * P1 - Important metrics, include if space allows
 * P2 - Nice-to-have metrics, move to deep-dive dashboards
 */
export enum WidgetPriority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
}

/**
 * Dashboard metric categories for organization
 */
export type MetricCategory =
  | 'compute'
  | 'storage'
  | 'network'
  | 'security'
  | 'cost'
  | 'performance'
  | 'business';

/**
 * Dashboard widget with metadata for prioritization
 */
export interface PrioritizedWidget {
  widget: cloudwatch.IWidget;
  priority: WidgetPriority;
  category: MetricCategory;
  section: string;
}

/**
 * Collection of widgets for a specific service/component
 */
export interface DashboardMetrics {
  category: MetricCategory;
  widgets: PrioritizedWidget[];
}

/**
 * Lambda function metrics for monitoring
 */
export interface LambdaMetrics {
  invocations: cloudwatch.IMetric;
  errors: cloudwatch.IMetric;
  duration: cloudwatch.IMetric;
  throttles?: cloudwatch.IMetric;
  concurrentExecutions?: cloudwatch.IMetric;
  estimatedCost?: cloudwatch.IMetric;
}

/**
 * ECS service metrics for monitoring
 */
export interface ECSMetrics {
  cpuUtilization: cloudwatch.IMetric;
  memoryUtilization: cloudwatch.IMetric;
  runningTasks: cloudwatch.IMetric;
  targetResponse?: cloudwatch.IMetric;
  requestCount?: cloudwatch.IMetric;
}

/**
 * Aurora database metrics for monitoring
 */
export interface AuroraMetrics {
  capacity: cloudwatch.IMetric;
  acuUtilization: cloudwatch.IMetric;
  connections: cloudwatch.IMetric;
  cpuUtilization: cloudwatch.IMetric;
  estimatedCost?: cloudwatch.IMetric;
}

/**
 * S3 storage metrics for monitoring
 */
export interface StorageMetrics {
  bucketSize: cloudwatch.IMetric;
  objectCount: cloudwatch.IMetric;
  estimatedCost?: cloudwatch.IMetric;
  requestMetrics?: {
    getRequests: cloudwatch.IMetric;
    putRequests: cloudwatch.IMetric;
  };
}

/**
 * VPC network metrics for monitoring
 */
export interface NetworkMetrics {
  bytesIn?: cloudwatch.IMetric;
  bytesOut?: cloudwatch.IMetric;
  packetsIn?: cloudwatch.IMetric;
  packetsOut?: cloudwatch.IMetric;
  natGatewayMetrics?: {
    bytesOutToDestination: cloudwatch.IMetric;
    bytesInFromDestination: cloudwatch.IMetric;
    activeConnectionCount: cloudwatch.IMetric;
  };
}

/**
 * Security and compliance metrics
 */
export interface SecurityMetrics {
  accessAnalyzerFindings?: cloudwatch.IMetric;
  secretsComplianceScore?: cloudwatch.IMetric;
  iamComplianceScore?: cloudwatch.IMetric;
  unauthorizedApiCalls?: cloudwatch.IMetric;
}

/**
 * Cost metrics aggregation
 */
export interface CostMetrics {
  lambdaCost?: cloudwatch.IMetric;
  auroraCost?: cloudwatch.IMetric;
  s3Cost?: cloudwatch.IMetric;
  ecsCost?: cloudwatch.IMetric;
  totalEstimatedCost?: cloudwatch.IMetric;
  costProjection?: cloudwatch.IMetric;
}

/**
 * API performance metrics
 */
export interface APIMetrics {
  requestCount: cloudwatch.IMetric;
  errorCount: cloudwatch.IMetric;
  latencyP50?: cloudwatch.IMetric;
  latencyP90?: cloudwatch.IMetric;
  latencyP99?: cloudwatch.IMetric;
  availability?: cloudwatch.IMetric;
}

/**
 * Aggregated metrics from all infrastructure components
 */
export interface ConsolidatedMetrics {
  api?: APIMetrics;
  lambda?: Record<string, LambdaMetrics>;
  ecs?: Record<string, ECSMetrics>;
  aurora?: AuroraMetrics;
  storage?: Record<string, StorageMetrics>;
  network?: NetworkMetrics;
  security?: SecurityMetrics;
  cost?: CostMetrics;
}

/**
 * Configuration for dashboard sections
 */
export interface DashboardSectionConfig {
  title: string;
  priority: WidgetPriority;
  maxWidgets: number;
  widgets: PrioritizedWidget[];
}

/**
 * Feature flags for dashboard migration
 */
export interface DashboardFeatureFlags {
  enableConsolidatedDashboards: boolean;
  keepLegacyDashboards: boolean;
  enableCostDashboard: boolean;
  enableDeepDiveDashboards: boolean;
}
