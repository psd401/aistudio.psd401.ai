import * as cdk from "aws-cdk-lib"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import * as rds from "aws-cdk-lib/aws-rds"
import { Construct } from "constructs"

export interface AuroraCostDashboardProps {
  /**
   * The Aurora cluster to monitor
   */
  cluster: rds.IDatabaseCluster

  /**
   * Environment name (dev, staging, prod)
   */
  environment: "dev" | "staging" | "prod"

  /**
   * Dashboard name
   * @default aurora-cost-{environment}
   */
  dashboardName?: string
}

/**
 * Creates a comprehensive CloudWatch dashboard for Aurora cost monitoring.
 *
 * Displays:
 * - Current ACU usage
 * - Estimated hourly/daily/monthly costs
 * - Connection metrics
 * - Cost optimization status
 */
export class AuroraCostDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard

  constructor(scope: Construct, id: string, props: AuroraCostDashboardProps) {
    super(scope, id)

    const dashboardName =
      props.dashboardName ?? `aurora-cost-${props.environment}`

    this.dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName,
    })

    // ACU capacity metric
    const capacityMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ServerlessDatabaseCapacity",
      dimensionsMap: {
        DBClusterIdentifier: props.cluster.clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
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

    // Cost optimization targets by environment
    const costTargets = {
      dev: { current: 44, target: 2, savings: 42 },
      staging: { current: 44, target: 24, savings: 20 },
      prod: { current: 176, target: 123, savings: 53 },
    }

    const target = costTargets[props.environment]

    // Build the dashboard
    this.dashboard.addWidgets(
      // Row 1: Overview
      new cloudwatch.TextWidget({
        markdown: `# Aurora Cost Optimization Dashboard - ${props.environment.toUpperCase()}

## Current Configuration
- **Cluster**: ${props.cluster.clusterIdentifier}
- **Environment**: ${props.environment}
- **Strategy**: ${props.environment === "dev" ? "Auto-pause during idle" : props.environment === "staging" ? "Scheduled scaling + auto-pause" : "Predictive scaling"}

## Cost Targets
- **Current Baseline**: $${target.current}/month
- **Target**: $${target.target}/month
- **Savings Goal**: $${target.savings}/month (${Math.round((target.savings / target.current) * 100)}%)
`,
        width: 24,
        height: 4,
      })
    )

    // Row 2: ACU and Cost Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Aurora Capacity (ACU)",
        left: [capacityMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: "ACU",
          min: 0,
        },
      }),
      new cloudwatch.GraphWidget({
        title: "Estimated Hourly Cost",
        left: [hourlyCostMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: "Cost ($/hour)",
          min: 0,
        },
      })
    )

    // Row 3: Cost Projections
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "Current Hourly Cost",
        metrics: [hourlyCostMetric],
        width: 6,
        height: 4,
        setPeriodToTimeRange: false,
      }),
      new cloudwatch.SingleValueWidget({
        title: "Projected Daily Cost",
        metrics: [dailyCostMetric],
        width: 6,
        height: 4,
        setPeriodToTimeRange: false,
      }),
      new cloudwatch.SingleValueWidget({
        title: "Projected Monthly Cost",
        metrics: [monthlyCostMetric],
        width: 6,
        height: 4,
        setPeriodToTimeRange: false,
      }),
      new cloudwatch.SingleValueWidget({
        title: "Monthly Savings Goal",
        metrics: [
          new cloudwatch.MathExpression({
            expression: `${target.savings}`,
            label: `$${target.savings}/month`,
          }),
        ],
        width: 6,
        height: 4,
      })
    )

    // Row 4: Connection and Performance Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Database Connections",
        left: [connectionsMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: "Connections",
          min: 0,
        },
      }),
      new cloudwatch.GraphWidget({
        title: "CPU Utilization",
        left: [cpuMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: "Percent",
          min: 0,
          max: 100,
        },
      })
    )

    // Row 5: Cost Optimization Status
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `## Cost Optimization Status

| Metric | Value | Status |
|--------|-------|--------|
| Auto-Pause Enabled | ${props.environment !== "prod" ? "✅ Yes" : "❌ No"} | ${props.environment !== "prod" ? "Optimal for " + props.environment : "N/A for prod"} |
| Scheduled Scaling | ${props.environment !== "dev" ? "✅ Yes" : "❌ No"} | ${props.environment !== "dev" ? "Active" : "N/A for dev"} |
| Connection Pooling | ✅ RDS Proxy | Active |
| Data API Enabled | ✅ Yes | Reduces connection overhead |

## Optimization Strategies Active
${
  props.environment === "dev"
    ? `
- **Auto-Pause**: Cluster pauses after 30 minutes of inactivity
- **Minimal Capacity**: 0.5-2 ACU range
- **Estimated Savings**: ~$42/month (95% reduction)
`
    : props.environment === "staging"
      ? `
- **Auto-Pause**: Enabled during idle periods
- **Business Hours Scaling**: 0.5-2 ACU
- **Off-Hours Scaling**: 0.5 ACU minimum
- **Estimated Savings**: ~$20/month (45% reduction)
`
      : `
- **Predictive Scaling**: Based on usage patterns
- **Business Hours**: 2-8 ACU (M-F 7:30am-8pm)
- **Off-Hours**: 1-4 ACU
- **Weekend**: 0.5-2 ACU
- **Estimated Savings**: ~$53/month (30% reduction)
`
}

## Next Steps
1. Monitor actual usage patterns for 1 week
2. Adjust scaling schedules based on observed patterns
3. Review cost reports monthly
4. Consider additional optimizations if needed
`,
        width: 24,
        height: 8,
      })
    )

    // Output dashboard URL
    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${dashboardName}`,
      description: `CloudWatch dashboard URL for ${props.environment}`,
    })
  }
}
