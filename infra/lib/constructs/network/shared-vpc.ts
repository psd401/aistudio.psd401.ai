import * as cdk from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as logs from "aws-cdk-lib/aws-logs"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import { Construct } from "constructs"
import { IEnvironmentConfig } from "../config/environment-config"

export interface SharedVPCProps {
  environment: "dev" | "staging" | "prod"
  config: IEnvironmentConfig
  enableFlowLogs?: boolean
  enableVpcEndpoints?: boolean
}

/**
 * Shared VPC construct for AI Studio infrastructure.
 *
 * This construct creates a single, shared VPC with proper subnet segmentation,
 * comprehensive VPC endpoints, and flow logs for network visibility.
 *
 * Features:
 * - Multi-AZ deployment for high availability
 * - Separate subnets for different workload types (public, private app, private data, isolated)
 * - Cost-optimized NAT gateway configuration (instance for dev, gateway for prod)
 * - Gateway endpoints for S3 and DynamoDB (no cost)
 * - Interface endpoints for AWS services (reduces data transfer costs)
 * - VPC flow logs to S3 for security monitoring
 * - CloudWatch metrics and dashboard
 *
 * Cost Optimization:
 * - Dev: Uses NAT instance instead of NAT gateway ($5/month vs $45/month)
 * - Prod: Strategic use of VPC endpoints reduces NAT gateway data transfer costs
 * - Flow logs to S3 with lifecycle policies (cheaper than CloudWatch Logs)
 *
 * Security:
 * - Private subnets for application and database workloads
 * - Isolated subnets for sensitive workloads
 * - VPC endpoints for private connectivity to AWS services
 * - Flow logs for network traffic analysis
 *
 * @see https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Scenario2.html
 */
export class SharedVPC extends Construct {
  public readonly vpc: ec2.IVpc
  public readonly publicSubnets: ec2.ISubnet[]
  public readonly privateSubnets: ec2.ISubnet[]
  public readonly dataSubnets: ec2.ISubnet[]
  public readonly isolatedSubnets: ec2.ISubnet[]
  public readonly vpcEndpoints: Map<string, ec2.IInterfaceVpcEndpoint>
  public readonly flowLogBucket?: s3.IBucket

  constructor(scope: Construct, id: string, props: SharedVPCProps) {
    super(scope, id)

    const { environment, config } = props

    // Create VPC with optimized configuration
    this.vpc = new ec2.Vpc(this, "SharedVPC", {
      vpcName: `aistudio-${environment}-vpc`,
      maxAzs: config.network.maxAzs,
      natGateways: config.network.natGateways,
      natGatewayProvider: this.createOptimizedNatProvider(environment),

      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Private-Application",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 22, // Larger subnet for applications (1024 IPs)
        },
        {
          name: "Private-Data",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24, // Standard subnet for databases (256 IPs)
        },
        {
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24, // Isolated subnet for sensitive workloads
        },
      ],

      // Enable DNS for private hosted zones and VPC endpoints
      enableDnsHostnames: true,
      enableDnsSupport: true,
    })

    // Tag subnets for better identification
    this.tagSubnets()

    // Store subnet references
    this.publicSubnets = this.vpc.publicSubnets

    // Private-Application subnets (for ECS, Lambda, etc.)
    const privateAppSubnets = this.vpc.selectSubnets({
      subnetGroupName: "Private-Application",
    }).subnets
    this.privateSubnets = privateAppSubnets

    // Private-Data subnets (for RDS, ElastiCache, etc.)
    this.dataSubnets = this.vpc.selectSubnets({
      subnetGroupName: "Private-Data",
    }).subnets

    // Isolated subnets (no internet access)
    this.isolatedSubnets = this.vpc.isolatedSubnets

    // Initialize VPC endpoints map
    this.vpcEndpoints = new Map<string, ec2.IInterfaceVpcEndpoint>()

    // Add VPC Endpoints
    if (props.enableVpcEndpoints !== false) {
      this.createVpcEndpoints(environment, config)
    }

    // Enable VPC Flow Logs
    if (props.enableFlowLogs !== false) {
      this.flowLogBucket = this.enableVpcFlowLogs(environment)
    }

    // Add CloudWatch metrics
    this.addVpcMetrics(environment)
  }

  /**
   * Create cost-optimized NAT provider based on environment.
   *
   * Development: Uses NAT instance (t3.nano) to save costs (~$5/month)
   * Production: Uses managed NAT gateways for reliability ($45/month each)
   */
  private createOptimizedNatProvider(
    environment: string
  ): ec2.NatProvider {
    if (environment === "dev") {
      // Use NAT instances for dev to save costs
      return ec2.NatProvider.instance({
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.NANO
        ),
      })
    }

    // Use managed NAT gateways for production reliability
    return ec2.NatProvider.gateway()
  }

  /**
   * Create VPC endpoints for AWS services.
   *
   * Gateway Endpoints (no hourly cost, only data transfer):
   * - S3: For object storage access
   * - DynamoDB: For NoSQL database access
   *
   * Interface Endpoints (~$7.20/month each, saves on NAT data transfer):
   * - Secrets Manager, RDS Data API, ECR, CloudWatch Logs, SNS, SQS, etc.
   *
   * Interface endpoints are deployed selectively based on environment:
   * - Dev: Only essential endpoints (Secrets Manager, RDS, ECR, Logs)
   * - Prod: Comprehensive endpoints including Textract and Comprehend
   */
  private createVpcEndpoints(
    environment: string,
    config: IEnvironmentConfig
  ): void {
    // Security group for VPC endpoints
    const endpointSg = new ec2.SecurityGroup(this, "VpcEndpointSg", {
      vpc: this.vpc,
      description: "Security group for VPC endpoints",
      allowAllOutbound: false,
    })

    endpointSg.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      "Allow HTTPS from VPC"
    )

    // Gateway endpoints (no cost, recommended for all environments)
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    })

    this.vpc.addGatewayEndpoint("DynamoDBEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    })

    // Interface endpoints configuration
    // Essential endpoints for all environments
    const essentialEndpoints = [
      {
        name: "SecretsManager",
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      },
      {
        name: "RDS",
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
      },
      {
        name: "RDSData",
        service: ec2.InterfaceVpcEndpointAwsService.RDS_DATA,
      },
      {
        name: "ECRApi",
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
      },
      {
        name: "ECRDkr",
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      },
      {
        name: "CloudWatchLogs",
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      },
      {
        name: "CloudWatchMonitoring",
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
      },
      {
        name: "SNS",
        service: ec2.InterfaceVpcEndpointAwsService.SNS,
      },
      {
        name: "SQS",
        service: ec2.InterfaceVpcEndpointAwsService.SQS,
      },
      {
        name: "Lambda",
        service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
      },
      {
        name: "SSM",
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
      },
      {
        name: "KMS",
        service: ec2.InterfaceVpcEndpointAwsService.KMS,
      },
      {
        name: "ECS",
        service: ec2.InterfaceVpcEndpointAwsService.ECS,
      },
      {
        name: "ECSAgent",
        service: ec2.InterfaceVpcEndpointAwsService.ECS_AGENT,
      },
      {
        name: "ECSTelemetry",
        service: ec2.InterfaceVpcEndpointAwsService.ECS_TELEMETRY,
      },
    ]

    // Production-only endpoints (expensive but useful for prod workloads)
    const productionOnlyEndpoints = [
      {
        name: "Textract",
        service: ec2.InterfaceVpcEndpointAwsService.TEXTRACT,
      },
      {
        name: "Comprehend",
        service: ec2.InterfaceVpcEndpointAwsService.COMPREHEND,
      },
    ]

    // Determine which endpoints to create based on environment
    const endpointsToCreate =
      environment === "prod"
        ? [...essentialEndpoints, ...productionOnlyEndpoints]
        : essentialEndpoints

    // Create interface endpoints
    for (const endpoint of endpointsToCreate) {
      const vpcEndpoint = this.vpc.addInterfaceEndpoint(
        `${endpoint.name}Endpoint`,
        {
          service: endpoint.service,
          securityGroups: [endpointSg],
          privateDnsEnabled: true,
          subnets: {
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        }
      )

      this.vpcEndpoints.set(endpoint.name, vpcEndpoint)
    }
  }

  /**
   * Enable VPC Flow Logs for network traffic monitoring.
   *
   * Flow logs are stored in S3 with lifecycle policies for cost optimization:
   * - Dev: 30-day retention
   * - Prod: 90-day retention with transition to Infrequent Access after 30 days
   *
   * Additionally, production environments get real-time CloudWatch Logs
   * for rejected traffic only (for security alerts).
   */
  private enableVpcFlowLogs(environment: string): s3.IBucket {
    // S3 bucket for flow logs (cheaper than CloudWatch Logs)
    const flowLogBucket = new s3.Bucket(this, "FlowLogBucket", {
      bucketName: `aistudio-${environment}-vpc-flow-logs-${
        cdk.Stack.of(this).account
      }`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(environment === "prod" ? 90 : 30),
          transitions:
            environment === "prod"
              ? [
                  {
                    storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                    transitionAfter: cdk.Duration.days(30),
                  },
                ]
              : [],
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "prod",
    })

    // VPC Flow Logs to S3
    new ec2.FlowLog(this, "VPCFlowLog", {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toS3(
        flowLogBucket,
        "vpc-flow-logs"
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
      flowLogName: `${this.vpc.vpcId}-flow-log`,
      maxAggregationInterval:
        ec2.FlowLogMaxAggregationInterval.TEN_MINUTES,
    })

    // Optional: CloudWatch Logs for real-time analysis (more expensive, prod only)
    if (environment === "prod") {
      const logGroup = new logs.LogGroup(this, "FlowLogGroup", {
        logGroupName: `/aws/vpc/flowlogs/${environment}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      })

      new ec2.FlowLog(this, "VPCFlowLogCloudWatch", {
        resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
        destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup),
        trafficType: ec2.FlowLogTrafficType.REJECT, // Only rejected traffic for alerts
      })
    }

    return flowLogBucket
  }

  /**
   * Tag subnets for better identification and ELB integration.
   */
  private tagSubnets(): void {
    // Tag public subnets for ELB
    for (const subnet of this.vpc.publicSubnets) {
      cdk.Tags.of(subnet).add("kubernetes.io/role/elb", "1")
      cdk.Tags.of(subnet).add("SubnetType", "Public")
      cdk.Tags.of(subnet).add("Name", `aistudio-public-${subnet.availabilityZone}`)
    }

    // Tag private subnets
    for (const subnet of this.vpc.privateSubnets) {
      cdk.Tags.of(subnet).add("kubernetes.io/role/internal-elb", "1")
      cdk.Tags.of(subnet).add("SubnetType", "Private-Application")
      cdk.Tags.of(subnet).add(
        "Name",
        `aistudio-private-app-${subnet.availabilityZone}`
      )
    }

    // Tag isolated subnets
    for (const subnet of this.vpc.isolatedSubnets) {
      cdk.Tags.of(subnet).add("SubnetType", "Isolated")
      cdk.Tags.of(subnet).add(
        "Name",
        `aistudio-isolated-${subnet.availabilityZone}`
      )
    }
  }

  /**
   * Add CloudWatch metrics for VPC monitoring.
   *
   * Creates a CloudWatch dashboard with:
   * - NAT Gateway data transfer metrics
   * - VPC Endpoint usage metrics
   */
  private addVpcMetrics(environment: string): void {
    // Custom CloudWatch dashboard for VPC metrics
    const dashboard = new cloudwatch.Dashboard(this, "VPCDashboard", {
      dashboardName: `${environment}-vpc-metrics`,
    })

    // NAT Gateway metrics (if using NAT gateways)
    if (environment !== "dev") {
      const natGatewayBytes = new cloudwatch.Metric({
        namespace: "AWS/NATGateway",
        metricName: "BytesOutToDestination",
        statistic: "Sum",
        period: cdk.Duration.hours(1),
      })

      const natGatewayPackets = new cloudwatch.Metric({
        namespace: "AWS/NATGateway",
        metricName: "PacketsOutToDestination",
        statistic: "Sum",
        period: cdk.Duration.hours(1),
      })

      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: "NAT Gateway Data Transfer",
          left: [natGatewayBytes],
          width: 12,
        }),
        new cloudwatch.GraphWidget({
          title: "NAT Gateway Packets",
          left: [natGatewayPackets],
          width: 12,
        })
      )
    }

    // VPC Endpoint metrics
    const vpcEndpointBytes = new cloudwatch.Metric({
      namespace: "AWS/PrivateLinkEndpoints",
      metricName: "BytesProcessed",
      statistic: "Sum",
      period: cdk.Duration.hours(1),
    })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "VPC Endpoint Data Transfer",
        left: [vpcEndpointBytes],
        width: 12,
      })
    )
  }

  /**
   * Helper method to get subnets for specific workload types.
   *
   * @param workloadType - Type of workload: 'web', 'app', 'data', or 'secure'
   * @returns Subnet selection appropriate for the workload type
   */
  public getSubnetsForWorkload(
    workloadType: "web" | "app" | "data" | "secure"
  ): ec2.SubnetSelection {
    switch (workloadType) {
      case "web":
        return { subnetType: ec2.SubnetType.PUBLIC }
      case "app":
        return { subnetGroupName: "Private-Application" }
      case "data":
        return { subnetGroupName: "Private-Data" }
      case "secure":
        return { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
      default:
        return { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
    }
  }
}
