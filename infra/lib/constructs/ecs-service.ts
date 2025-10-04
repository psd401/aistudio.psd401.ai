import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export interface EcsServiceConstructProps {
  vpc: ec2.IVpc;
  environment: 'dev' | 'prod';
  documentsBucketName: string;
  enableContainerInsights?: boolean;
  enableFargateSpot?: boolean;
  /**
   * If false, HTTP listener will not be created automatically.
   * This allows the parent stack to configure HTTPS and HTTP->HTTPS redirect.
   */
  createHttpListener?: boolean;
}

/**
 * ECS Fargate service construct for the AI Studio Next.js application.
 * Provides HTTP/2 streaming support through Application Load Balancer.
 */
export class EcsServiceConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly taskRole: iam.Role;
  public readonly repository: ecr.Repository;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: EcsServiceConstructProps) {
    super(scope, id);

    const { vpc, environment, documentsBucketName } = props;

    // ============================================================================
    // ECR Repository for container images
    // ============================================================================
    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: `aistudio-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
          rulePriority: 1,
        },
      ],
    });

    // ============================================================================
    // ECS Cluster with Container Insights
    // ============================================================================
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `aistudio-${environment}`,
      vpc,
      containerInsights: props.enableContainerInsights ?? true,
    });

    // ============================================================================
    // Application Load Balancer
    // ============================================================================
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    // Allow HTTPS from internet
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from internet'
    );

    // Allow HTTP for ALB health checks and redirect
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP for redirect to HTTPS'
    );

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: albSecurityGroup,
      http2Enabled: true,
      deletionProtection: environment === 'prod',
      idleTimeout: cdk.Duration.seconds(300), // 5 minutes for long streaming requests
    });

    // ============================================================================
    // ECS Task Definition
    // ============================================================================
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/aistudio-${environment}`,
      retention: environment === 'prod'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Task Execution Role - for pulling images and writing logs
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant ECR pull permissions
    this.repository.grantPull(taskExecutionRole);

    // Grant Secrets Manager access for environment variables
    taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
      ],
      resources: [
        `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:aistudio-${environment}-*`,
        `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:aistudio/${environment}/*`,
      ],
    }));

    // Task Role - for application permissions (same as current SSR Compute Role)
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `ECS Task role for AI Studio ${environment}`,
      inlinePolicies: {
        'RDSDataAPIAccess': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'rds-data:ExecuteStatement',
                'rds-data:BatchExecuteStatement',
                'rds-data:BeginTransaction',
                'rds-data:CommitTransaction',
                'rds-data:RollbackTransaction',
              ],
              resources: [
                `arn:aws:rds:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:cluster:aistudio-${environment}`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              resources: [
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:aistudio-${environment}-*`,
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:aistudio/${environment}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
                's3:HeadObject',
                's3:HeadBucket',
              ],
              resources: [
                `arn:aws:s3:::${documentsBucketName}`,
                `arn:aws:s3:::${documentsBucketName}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sqs:SendMessage',
                'sqs:GetQueueAttributes',
                'sqs:GetQueueUrl',
              ],
              resources: [
                `arn:aws:sqs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:aistudio-${environment}-*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['lambda:InvokeFunction'],
              resources: [
                `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:aistudio-${environment}-schedule-executor`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/aistudio-${environment}-*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/*',
                'arn:aws:bedrock:*:*:inference-profile/*',
                'arn:aws:bedrock:*:*:provisioned-model/*',
              ],
            }),
          ],
        }),
      },
    });

    // Task Definition
    const cpu = environment === 'prod' ? 1024 : 512; // 1 vCPU prod, 0.5 dev
    const memory = environment === 'prod' ? 2048 : 1024; // 2GB prod, 1GB dev

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu,
      memoryLimitMiB: memory,
      executionRole: taskExecutionRole,
      taskRole: this.taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Retrieve environment variables from SSM Parameter Store
    // These will be set during deployment
    const container = taskDefinition.addContainer('NextJsContainer', {
      containerName: 'nextjs-app',
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      memoryLimitMiB: memory,
      memoryReservationMiB: Math.floor(memory * 0.8), // Soft limit for better resource management
      cpu,
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'frontend',
      }),
      environment: {
        NODE_ENV: 'production',
        AWS_REGION: cdk.Stack.of(this).region,
        NEXT_PUBLIC_AWS_REGION: cdk.Stack.of(this).region,
        PORT: '3000',
        // Memory optimization - 70% of container memory
        NODE_OPTIONS: `--max-old-space-size=${Math.floor(memory * 0.7)}`,
      },
      // Secrets will be injected from Secrets Manager/SSM at runtime
      secrets: {
        // These will be populated from SSM Parameter Store
        // AUTH_URL: ecs.Secret.fromSsmParameter(),
        // AUTH_SECRET: ecs.Secret.fromSecretsManager(),
        // etc.
      },
      // Security: Read-only root filesystem with tmpfs mounts for writable directories
      readonlyRootFilesystem: true,
      // Enable init process for proper signal handling (tini)
      linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
        initProcessEnabled: true, // Critical for graceful shutdown
        // Add tmpfs mounts for Next.js writable directories
        tmpfs: [
          {
            containerPath: '/tmp',
            size: 512, // MB
          },
          {
            containerPath: '/app/.next/cache',
            size: 256, // MB
          },
        ],
      }),
      // File descriptor limits
      ulimits: [
        {
          name: ecs.UlimitName.NOFILE,
          softLimit: 65536,
          hardLimit: 65536,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/api/healthz || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(120), // Increased from 60s for Next.js startup
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // ============================================================================
    // ECS Service with Auto Scaling
    // ============================================================================
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });

    // Allow traffic from ALB
    ecsSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB'
    );

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      serviceName: `aistudio-${environment}`,
      desiredCount: environment === 'prod' ? 1 : 1,
      minHealthyPercent: environment === 'prod' ? 100 : 0,
      maxHealthyPercent: 200,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      capacityProviderStrategies: props.enableFargateSpot && environment === 'dev'
        ? [
            {
              capacityProvider: 'FARGATE_SPOT',
              weight: 1,
              base: 0,
            },
          ]
        : [
            {
              capacityProvider: 'FARGATE',
              weight: 1,
              base: 1,
            },
          ],
      circuitBreaker: {
        rollback: true,
      },
      enableExecuteCommand: true, // For debugging
    });

    // ============================================================================
    // Target Group and Listener
    // ============================================================================
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/healthz', // Use lightweight endpoint for ALB health checks
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      stickinessCookieDuration: cdk.Duration.hours(1),
      targets: [this.service],
    });

    // HTTP Listener - only create if explicitly requested
    // For production, parent stack should configure HTTPS and HTTP->HTTPS redirect
    if (props.createHttpListener !== false) {
      this.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [this.targetGroup],
      });
    }

    // ============================================================================
    // Auto Scaling
    // ============================================================================
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: environment === 'prod' ? 10 : 3,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300), // 5 minutes
      scaleOutCooldown: cdk.Duration.seconds(60), // 1 minute
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // ============================================================================
    // Outputs and SSM Parameters
    // ============================================================================
    new ssm.StringParameter(this, 'LoadBalancerDnsParam', {
      parameterName: `/aistudio/${environment}/alb-dns-name`,
      stringValue: this.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name for ECS service',
    });

    new ssm.StringParameter(this, 'EcrRepositoryUriParam', {
      parameterName: `/aistudio/${environment}/ecr-repository-uri`,
      stringValue: this.repository.repositoryUri,
      description: 'ECR repository URI for container images',
    });

    new ssm.StringParameter(this, 'EcsClusterNameParam', {
      parameterName: `/aistudio/${environment}/ecs-cluster-name`,
      stringValue: this.cluster.clusterName,
      description: 'ECS cluster name',
    });

    new ssm.StringParameter(this, 'EcsServiceNameParam', {
      parameterName: `/aistudio/${environment}/ecs-service-name`,
      stringValue: this.service.serviceName,
      description: 'ECS service name',
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
      exportName: `${environment}-AlbDnsName`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `${environment}-EcrRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${environment}-EcsClusterName`,
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
      exportName: `${environment}-EcsServiceName`,
    });

    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: this.taskRole.roleArn,
      description: 'ECS Task Role ARN',
      exportName: `${environment}-EcsTaskRoleArn`,
    });
  }

  /**
   * Create CloudWatch dashboard for monitoring the ECS service
   */
  public createDashboard(props: { environment: string }): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `aistudio-ecs-${props.environment}`,
    });

    // Service metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Service CPU and Memory',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ServiceName: this.service.serviceName,
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ServiceName: this.service.serviceName,
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
          }),
        ],
      })
    );

    // ALB metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Load Balancer Request Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'RequestCount',
            dimensionsMap: {
              LoadBalancer: this.loadBalancer.loadBalancerFullName,
            },
            statistic: 'Sum',
          }),
        ],
      })
    );

    // Target health
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Task Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ServiceName: this.service.serviceName,
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
          }),
        ],
      })
    );

    return dashboard;
  }
}
