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
  /**
   * Custom subdomain to use instead of environment-based default.
   * For example: 'dev-ecs' will create 'dev-ecs.aistudio.psd401.ai'
   * If not provided, defaults to 'dev' for dev or root domain for prod
   */
  customSubdomain?: string;
  documentsBucketName?: string; // Optional for backward compatibility
  /**
   * If true, will look up existing VPC from database stack.
   * If false, will create a new VPC for ECS (not recommended - prefer VPC sharing)
   */
  useExistingVpc?: boolean;
  /**
   * If false, skip DNS and certificate setup.
   * Useful for CI/CD validation where hosted zones don't exist.
   */
  setupDns?: boolean;
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
      // This VPC config matches the database stack VPC for consistency
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
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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
    // DNS and SSL Certificate Configuration
    // ============================================================================
    // Build the full domain name
    // If customSubdomain provided, use it (e.g., 'dev-ecs' -> 'dev-ecs.aistudio.psd401.ai')
    // Otherwise use environment-based default ('dev' -> 'dev.aistudio.psd401.ai')
    const subdomain = props.customSubdomain
      ? `${props.customSubdomain}.${baseDomain}`
      : (environment === 'dev' ? `dev.${baseDomain}` : baseDomain);

    // ============================================================================
    // Create ECS Service with ALB
    // ============================================================================
    this.ecsService = new EcsServiceConstruct(this, 'EcsService', {
      vpc,
      environment,
      documentsBucketName,
      enableContainerInsights: true,
      enableFargateSpot: environment === 'dev', // Cost optimization for dev
      createHttpListener: false, // We'll create HTTP listener with redirect below
      // Docker image configuration
      dockerImageSource: 'fromAsset', // CDK builds and pushes image automatically
      dockerfilePath: '../', // Dockerfile in project root
      // Auth configuration from Cognito stack outputs
      authUrl: `https://${subdomain}`,
      cognitoClientId: cdk.Fn.importValue(`${environment}-CognitoUserPoolClientId`),
      cognitoIssuer: `https://cognito-idp.${this.region}.amazonaws.com/${cdk.Fn.importValue(`${environment}-CognitoUserPoolId`)}`,
      // Database configuration from SSM parameters
      rdsResourceArn: ssm.StringParameter.valueForStringParameter(this, `/aistudio/${environment}/db-cluster-arn`),
      rdsSecretArn: ssm.StringParameter.valueForStringParameter(this, `/aistudio/${environment}/db-secret-arn`),
      // Auth secret from Secrets Manager
      authSecretArn: cdk.Fn.importValue(`${environment}-AuthSecretArn`),
      // NEW: Internal API secret for scheduled execution authentication (from SSM to avoid circular dependency)
      internalApiSecretArn: ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${environment}/internal-api-secret-arn`
      ),
    });

    // ============================================================================
    // DNS and SSL Certificate
    // ============================================================================

    if (props.setupDns !== false) {

      // Look up hosted zone - need to find the parent zone (psd401.ai)
      // baseDomain might be 'aistudio.psd401.ai', so we need to extract 'psd401.ai'
      const zoneDomain = baseDomain.includes('.')
        ? baseDomain.split('.').slice(-2).join('.') // Extract 'psd401.ai' from 'aistudio.psd401.ai'
        : baseDomain; // If no subdomain, use as-is

      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: zoneDomain,
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

      // Create HTTP listener that redirects to HTTPS
      this.ecsService.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });

      // Create DNS record pointing to ALB
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: subdomain,
        target: route53.RecordTarget.fromAlias(
          new targets.LoadBalancerTarget(this.ecsService.loadBalancer)
        ),
      });
    } else {
      // No DNS setup - create HTTP listener only for development/CI
      this.ecsService.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [this.ecsService.targetGroup],
      });
    }

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
    // SSM Parameters for Cross-Stack References
    // ============================================================================
    // Store ECS internal endpoint URL for schedule executor Lambda
    // Lambda will use internal ALB DNS (not public DNS) for better security
    // Note: Uses SSM instead of CloudFormation export to avoid circular dependency with SchedulerStack
    new ssm.StringParameter(this, 'EcsInternalEndpointParam', {
      parameterName: `/aistudio/${environment}/ecs-internal-endpoint`,
      stringValue: `http://${this.ecsService.loadBalancer.loadBalancerDnsName}`,
      description: 'Internal ECS endpoint URL for schedule executor Lambda (HTTP, internal ALB)',
    });

    // ============================================================================
    // Outputs (ECS-related outputs are in the construct, only add stack-specific ones here)
    // ============================================================================
    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: `https://${subdomain}`,
      description: 'Application URL',
      exportName: `${environment}-ecs-ApplicationUrl`,
    });

    new cdk.CfnOutput(this, 'WAFArn', {
      value: webAcl.attrArn,
      description: 'WAF WebACL ARN',
      exportName: `${environment}-ecs-WAFArn`,
    });

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
      description: 'CloudWatch Dashboard Name',
      exportName: `${environment}-ecs-DashboardName`,
    });

    // ============================================================================
    // Deployment Information
    // ============================================================================
    // Note: With ContainerImage.fromAsset(), CDK automatically builds and pushes
    // the Docker image during deployment. No manual Docker commands required!
    new cdk.CfnOutput(this, 'DeploymentInfo', {
      value: [
        '=== ECS Deployment ===',
        `CDK automatically builds and pushes Docker images during deployment.`,
        ``,
        `To deploy updates:`,
        `  cd infra && npx cdk deploy ${this.stackName}`,
        ``,
        `To monitor deployment:`,
        `  aws ecs describe-services --cluster ${this.ecsService.cluster.clusterName} --services ${this.ecsService.service.serviceName}`,
        ``,
        `To view logs:`,
        `  aws logs tail /ecs/aistudio-${environment} --follow`,
        ``,
        `Application URL:`,
        `  https://${subdomain}`,
      ].join('\n'),
      description: 'ECS deployment information',
    });
  }
}
