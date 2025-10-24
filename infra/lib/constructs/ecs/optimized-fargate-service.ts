import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as autoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';

export interface OptimizedFargateServiceProps {
  vpc: ec2.IVpc;
  cluster: ecs.Cluster;
  environment: 'dev' | 'prod';
  serviceName: string;
  taskDefinition: ecs.FargateTaskDefinition;
  targetGroup: elbv2.ApplicationTargetGroup;
  securityGroups: ec2.ISecurityGroup[];
  vpcSubnets: ec2.SubnetSelection;
  assignPublicIp: boolean;

  // Capacity configuration
  minCapacity?: number;
  maxCapacity?: number;
  spotRatio?: number; // Percentage of tasks to run on Spot (0-100)

  // Auto-scaling configuration
  enableAutoScaling?: boolean;
  targetCpuUtilization?: number;
  targetMemoryUtilization?: number;
  targetRequestCountPerTarget?: number;

  // Performance configuration
  enableContainerInsights?: boolean;
  enableScheduledScaling?: boolean;
}

export class OptimizedFargateService extends Construct {
  public readonly service: ecs.FargateService;
  public readonly dashboard: cloudwatch.Dashboard;
  private scalingTarget?: ecs.ScalableTaskCount;

  constructor(scope: Construct, id: string, props: OptimizedFargateServiceProps) {
    super(scope, id);

    const { environment, serviceName } = props;

    // Determine capacity provider strategy based on environment and spot ratio
    const capacityProviderStrategies = this.createCapacityProviderStrategy(
      environment,
      props.spotRatio ?? (environment === 'prod' ? 50 : 100)
    );

    // Create optimized service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: props.taskDefinition,
      serviceName: `${serviceName}-${environment}`,

      // Initial capacity (will be managed by auto-scaling)
      desiredCount: props.minCapacity ?? 1,

      // Rolling update configuration
      minHealthyPercent: environment === 'prod' ? 100 : 0,
      maxHealthyPercent: 200,

      // Capacity provider strategy for cost optimization
      capacityProviderStrategies,

      // Circuit breaker for faster rollback
      circuitBreaker: {
        enable: true,
        rollback: true,
      },

      // Health check grace period
      healthCheckGracePeriod: cdk.Duration.seconds(60),

      // Platform version for latest features
      platformVersion: ecs.FargatePlatformVersion.LATEST,

      // VPC configuration
      vpcSubnets: props.vpcSubnets,
      assignPublicIp: props.assignPublicIp,
      securityGroups: props.securityGroups,

      // Enable execute command for debugging
      enableExecuteCommand: true,
    });

    // Register with target group
    this.service.attachToApplicationTargetGroup(props.targetGroup);

    // Remove DesiredCount from CloudFormation template to prevent resets on deployment
    // This allows auto-scaling and manual scaling to manage task count independently
    const cfnService = this.service.node.defaultChild as ecs.CfnService;
    cfnService.addPropertyDeletionOverride('DesiredCount');

    // Configure auto-scaling
    if (props.enableAutoScaling !== false) {
      this.setupAutoScaling(props);
    }

    // Enable Container Insights at cluster level
    if (props.enableContainerInsights !== false) {
      this.enableContainerInsights();
    }

    // Setup monitoring dashboard
    this.dashboard = this.createMonitoringDashboard(environment, serviceName, props.targetGroup);

    // Add cost allocation tags
    cdk.Tags.of(this.service).add('CostOptimization', 'Enabled');
    cdk.Tags.of(this.service).add('SpotRatio', String(props.spotRatio ?? 0));
    cdk.Tags.of(this.service).add('Graviton', 'true');
  }

  private createCapacityProviderStrategy(
    environment: string,
    spotRatio: number
  ): ecs.CapacityProviderStrategy[] {
    if (environment === 'prod') {
      // Production: Mixed strategy for reliability
      // Base capacity on-demand, burst capacity on Spot
      return [
        {
          capacityProvider: 'FARGATE',
          base: 2, // Always keep 2 tasks on-demand for stability
          weight: 100 - spotRatio,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: spotRatio,
        },
      ];
    } else {
      // Dev/Staging: Maximize Spot usage for cost savings
      return [
        {
          capacityProvider: 'FARGATE_SPOT',
          base: 1,
          weight: 100,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 0, // Fallback only if Spot unavailable
        },
      ];
    }
  }

  private setupAutoScaling(props: OptimizedFargateServiceProps): void {
    // Create scalable target
    this.scalingTarget = this.service.autoScaleTaskCount({
      minCapacity: props.minCapacity ?? 1,
      maxCapacity: props.maxCapacity ?? (props.environment === 'prod' ? 10 : 3),
    });

    // CPU-based target tracking scaling
    if (props.targetCpuUtilization !== undefined) {
      this.scalingTarget.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: props.targetCpuUtilization,
        scaleInCooldown: cdk.Duration.seconds(300), // 5 minutes
        scaleOutCooldown: cdk.Duration.seconds(60),  // 1 minute
      });
    }

    // Memory-based target tracking scaling
    if (props.targetMemoryUtilization !== undefined) {
      this.scalingTarget.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: props.targetMemoryUtilization,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });
    }

    // Request count scaling (if target group provided)
    if (props.targetRequestCountPerTarget && props.targetGroup) {
      this.scalingTarget.scaleToTrackCustomMetric('RequestCountScaling', {
        targetValue: props.targetRequestCountPerTarget,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'RequestCountPerTarget',
          dimensionsMap: {
            TargetGroup: props.targetGroup.targetGroupFullName,
          },
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.seconds(60),
        }),
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });
    }

    // Scheduled scaling for predictable patterns
    if (props.enableScheduledScaling !== false && props.environment === 'prod') {
      this.addScheduledScaling();
    }
  }

  private addScheduledScaling(): void {
    if (!this.scalingTarget) {
      return;
    }

    // Scale up before business hours (Mon-Fri 7:30 AM PST)
    this.scalingTarget.scaleOnSchedule('MorningScaleUp', {
      schedule: autoscaling.Schedule.cron({
        hour: '15', // 7:30 AM PST = 3:30 PM UTC (assuming PST is UTC-8)
        minute: '30',
        weekDay: 'MON-FRI',
      }),
      minCapacity: 4,
      maxCapacity: 20,
    });

    // Scale down after business hours (8:00 PM PST)
    this.scalingTarget.scaleOnSchedule('EveningScaleDown', {
      schedule: autoscaling.Schedule.cron({
        hour: '4', // 8:00 PM PST = 4:00 AM UTC next day
        minute: '0',
        weekDay: 'TUE-SAT', // Next day in UTC
      }),
      minCapacity: 2,
      maxCapacity: 10,
    });

    // Weekend scaling (lower capacity)
    this.scalingTarget.scaleOnSchedule('WeekendScaling', {
      schedule: autoscaling.Schedule.cron({
        hour: '8', // Midnight PST = 8:00 AM UTC
        minute: '0',
        weekDay: 'SAT',
      }),
      minCapacity: 1,
      maxCapacity: 5,
    });
  }

  private enableContainerInsights(): void {
    // Container Insights is enabled at cluster level
    const cluster = this.service.cluster;
    const cfnCluster = cluster.node.defaultChild as ecs.CfnCluster;

    // Set Container Insights if not already set
    if (!cfnCluster.clusterSettings) {
      cfnCluster.clusterSettings = [{
        name: 'containerInsights',
        value: 'enabled',
      }];
    }
  }

  private createMonitoringDashboard(
    environment: string,
    serviceName: string,
    targetGroup: elbv2.ApplicationTargetGroup
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${serviceName}-${environment}-optimization`,
    });

    const clusterName = this.service.cluster.clusterName;
    const fullServiceName = this.service.serviceName;

    // Service metrics
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        ClusterName: clusterName,
        ServiceName: fullServiceName,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });

    const memoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      dimensionsMap: {
        ClusterName: clusterName,
        ServiceName: fullServiceName,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });

    const taskCountMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'RunningTaskCount',
      dimensionsMap: {
        ClusterName: clusterName,
        ServiceName: fullServiceName,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });

    // Request metrics from ALB
    const requestCountMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: {
        TargetGroup: targetGroup.targetGroupFullName,
      },
      statistic: cloudwatch.Stats.SUM,
      period: cdk.Duration.minutes(1),
    });

    // Cost optimization metrics (estimated hourly cost)
    // Fargate pricing (ARM64): On-Demand ~$0.04048/hour for 1 vCPU, 2GB
    // Spot pricing: ~70% discount = $0.012144/hour
    const estimatedCostPerHour = new cloudwatch.MathExpression({
      expression: 'tasks * 0.04048 * 0.5', // Assuming 0.5 vCPU average
      usingMetrics: {
        tasks: taskCountMetric,
      },
      label: 'Estimated Cost ($/hour)',
      period: cdk.Duration.minutes(5),
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# ECS Fargate Optimization Dashboard - ${environment.toUpperCase()}

## Service: ${fullServiceName}

### Optimization Features
- **Fargate Spot**: ${environment === 'prod' ? '50%' : '100%'} of tasks
- **Graviton2**: ARM64 architecture enabled
- **Auto-scaling**: CPU, Memory, and Request-based
- **Container Insights**: Enabled
- **Scheduled Scaling**: ${environment === 'prod' ? 'Active' : 'Disabled'}`,
        width: 24,
        height: 4,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Resource Utilization',
        left: [cpuMetric],
        right: [memoryMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          min: 0,
          max: 100,
        },
        rightYAxis: {
          label: 'Memory %',
          min: 0,
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Task Count & Request Volume',
        left: [taskCountMetric],
        right: [requestCountMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Tasks',
          min: 0,
        },
        rightYAxis: {
          label: 'Requests/min',
          min: 0,
        },
      })
    );

    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Estimated Hourly Cost',
        metrics: [estimatedCostPerHour],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Current Task Count',
        metrics: [taskCountMetric],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Average CPU Utilization',
        metrics: [cpuMetric],
        width: 8,
        height: 4,
      })
    );

    return dashboard;
  }
}
