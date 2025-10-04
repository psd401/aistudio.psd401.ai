import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { EcsServiceConstruct } from './constructs/ecs-service';

export interface FrontendStackEcsProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  baseDomain: string;
  documentsBucketName?: string; // Optional for backward compatibility
  /**
   * If true, will look up existing VPC from database stack.
   * If false, will create a new VPC for ECS (not recommended - prefer VPC sharing)
   */
  useExistingVpc?: boolean;
}

/**
 * ECS Fargate-based frontend stack for AI Studio.
 * Replaces Amplify hosting with containerized Next.js deployment
 * for native HTTP/2 streaming support.
 */
export class FrontendStackEcs extends cdk.Stack {
  public readonly ecsService: EcsServiceConstruct;

  constructor(scope: Construct, id: string, props: FrontendStackEcsProps) {
    super(scope, id, props);

    const { environment, baseDomain } = props;

    // ============================================================================
    // Retrieve VPC from database stack (VPC sharing pattern)
    // ============================================================================
    let vpc: ec2.IVpc;

    if (props.useExistingVpc !== false) {
      // Look up VPC by SSM parameter or tag
      // The DatabaseStack creates a VPC, we'll reference it
      vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
        tags: {
          Environment: environment === 'dev' ? 'Dev' : 'Prod',
          Project: 'AIStudio',
        },
      });
    } else {
      // Create new VPC for ECS (not recommended for production)
      vpc = new ec2.Vpc(this, 'EcsVpc', {
        maxAzs: environment === 'prod' ? 3 : 2,
        natGateways: environment === 'prod' ? 2 : 1,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'private',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
    }

    // Retrieve bucket name from SSM Parameter Store
    const documentsBucketName = props.documentsBucketName ||
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${environment}/documents-bucket-name`
      );

    // ============================================================================
    // Create ECS Service with ALB
    // ============================================================================
    this.ecsService = new EcsServiceConstruct(this, 'EcsService', {
      vpc,
      environment,
      documentsBucketName,
      enableContainerInsights: true,
      enableFargateSpot: environment === 'dev', // Cost optimization for dev
    });

    // ============================================================================
    // DNS and SSL Certificate
    // ============================================================================
    const subdomain = environment === 'dev' ? `dev.${baseDomain}` : baseDomain;

    // Look up hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: baseDomain,
    });

    // Create SSL certificate
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: subdomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Add HTTPS listener with certificate
    const httpsListener = this.ecsService.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultTargetGroups: [this.ecsService.targetGroup],
    });

    // Get the HTTP listener and configure it to redirect to HTTPS
    const httpListener = this.ecsService.loadBalancer.listeners[0];
    // Remove existing default action by configuring new default action
    httpListener.addAction('DefaultRedirectToHttps', {
      action: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
      priority: 1,
    });

    // Create DNS record pointing to ALB
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(this.ecsService.loadBalancer)
      ),
    });

    // ============================================================================
    // AWS WAF for Application Protection
    // ============================================================================
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'REGIONAL', // ALB uses REGIONAL, CloudFront uses CLOUDFRONT
      defaultAction: { allow: {} },
      description: `WAF for AIStudio ${environment} environment`,
      rules: [
        // Rate limiting rule
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000, // 2000 requests per 5 minutes per IP
              aggregateKeyType: 'IP',
            },
          },
          action: {
            block: {
              customResponse: {
                responseCode: 429,
                customResponseBodyKey: 'RateLimitBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
        // AWS Managed Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [
                { name: 'SizeRestrictions_BODY' }, // Allow larger payloads
                { name: 'GenericRFI_BODY' }, // May trigger on AI prompts
              ],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
          },
        },
        // Known bad inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
          },
        },
        // SQL injection protection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSet',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `EcsWAF-${environment}`,
      },
      customResponseBodies: {
        RateLimitBody: {
          contentType: 'APPLICATION_JSON',
          content: '{"error": "Too many requests. Please try again later."}',
        },
      },
    });

    // Associate WAF with ALB
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.ecsService.loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // ============================================================================
    // CloudWatch Dashboard
    // ============================================================================
    const dashboard = this.ecsService.createDashboard({ environment });

    // ============================================================================
    // Outputs
    // ============================================================================
    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: `https://${subdomain}`,
      description: 'Application URL',
      exportName: `${environment}-ApplicationUrl`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.ecsService.loadBalancer.loadBalancerDnsName,
      description: 'Load Balancer DNS Name',
      exportName: `${environment}-LoadBalancerDnsName`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.ecsService.repository.repositoryUri,
      description: 'ECR Repository URI for container images',
      exportName: `${environment}-EcrRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.ecsService.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${environment}-EcsClusterName`,
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: this.ecsService.service.serviceName,
      description: 'ECS Service Name',
      exportName: `${environment}-EcsServiceName`,
    });

    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: this.ecsService.taskRole.roleArn,
      description: 'ECS Task Role ARN (equivalent to SSR Compute Role)',
      exportName: `${environment}-EcsTaskRoleArn`,
    });

    new cdk.CfnOutput(this, 'WAFArn', {
      value: webAcl.attrArn,
      description: 'WAF WebACL ARN',
      exportName: `${environment}-WAFArn`,
    });

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
      description: 'CloudWatch Dashboard Name',
      exportName: `${environment}-DashboardName`,
    });

    // ============================================================================
    // Deployment Instructions
    // ============================================================================
    new cdk.CfnOutput(this, 'DeploymentInstructions', {
      value: [
        '=== Deployment Steps ===',
        `1. Build and push Docker image:`,
        `   docker build -t ${this.ecsService.repository.repositoryUri}:latest .`,
        `   aws ecr get-login-password --region ${this.region} | docker login --username AWS --password-stdin ${this.ecsService.repository.repositoryUri}`,
        `   docker push ${this.ecsService.repository.repositoryUri}:latest`,
        ``,
        `2. Update ECS service to use new image:`,
        `   aws ecs update-service --cluster ${this.ecsService.cluster.clusterName} --service ${this.ecsService.service.serviceName} --force-new-deployment`,
        ``,
        `3. Monitor deployment:`,
        `   aws ecs describe-services --cluster ${this.ecsService.cluster.clusterName} --services ${this.ecsService.service.serviceName}`,
        ``,
        `4. View logs:`,
        `   aws logs tail /ecs/aistudio-${environment} --follow`,
        ``,
        `5. Access application:`,
        `   https://${subdomain}`,
      ].join('\n'),
      description: 'Deployment instructions for ECS service',
    });
  }
}
