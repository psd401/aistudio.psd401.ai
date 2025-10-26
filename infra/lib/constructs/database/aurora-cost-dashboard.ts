import * as cdk from "aws-cdk-lib"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import * as rds from "aws-cdk-lib/aws-rds"
import { Construct } from "constructs"
import { AuroraMetrics } from "../observability/metrics-types"

export interface AuroraCostDashboardProps {
  /**
   * The Aurora cluster to monitor
   */
  cluster: rds.IDatabaseCluster

  /**
   * Environment name (dev, staging, prod)
   */
  environment: "dev" | "staging" | "prod"
}

/**
 * Aurora Cost Metrics Provider
 *
 * Exports metrics for Aurora cost monitoring to be consumed by consolidated dashboards.
 * Replaces the standalone dashboard with centralized metric collection.
 *
 * Provides:
 * - ACU capacity and utilization
 * - Database connections
 * - CPU utilization
 * - Estimated monthly costs
 */
export class AuroraCostDashboard extends Construct {
  public readonly metrics: AuroraMetrics
  public readonly estimatedMonthlyCost: cloudwatch.IMetric

  constructor(scope: Construct, id: string, props: AuroraCostDashboardProps) {
    super(scope, id)

    // ACU capacity metric
    const capacityMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ServerlessDatabaseCapacity",
      dimensionsMap: {
        DBClusterIdentifier: props.cluster.clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      label: "ACU Capacity",
    })

    // ACU utilization metric
    const acuUtilizationMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ACUUtilization",
      dimensionsMap: {
        DBClusterIdentifier: props.cluster.clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      label: "ACU Utilization %",
    })

    // Database connections metric
    const connectionsMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "DatabaseConnections",
      dimensionsMap: {
        DBClusterIdentifier: props.cluster.clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      label: "Database Connections",
    })

    // CPU utilization metric
    const cpuMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensionsMap: {
        DBClusterIdentifier: props.cluster.clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      label: "CPU Utilization %",
    })

    // Calculate estimated cost ($0.12 per ACU-hour)
    const hourlyCostMetric = new cloudwatch.MathExpression({
      expression: "acu * 0.12",
      usingMetrics: {
        acu: capacityMetric,
      },
      label: "Estimated Cost ($/hour)",
      period: cdk.Duration.minutes(5),
    })

    const dailyCostMetric = new cloudwatch.MathExpression({
      expression: "hourly * 24",
      usingMetrics: {
        hourly: hourlyCostMetric,
      },
      label: "Estimated Cost ($/day)",
      period: cdk.Duration.hours(1),
    })

    const monthlyCostMetric = new cloudwatch.MathExpression({
      expression: "daily * 30",
      usingMetrics: {
        daily: dailyCostMetric,
      },
      label: "Projected Cost ($/month)",
      period: cdk.Duration.hours(1),
    })

    // Export metrics for consolidated monitoring
    this.metrics = {
      capacity: capacityMetric,
      acuUtilization: acuUtilizationMetric,
      connections: connectionsMetric,
      cpuUtilization: cpuMetric,
      estimatedCost: monthlyCostMetric,
    }

    this.estimatedMonthlyCost = monthlyCostMetric
  }
}
