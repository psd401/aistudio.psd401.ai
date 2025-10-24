import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { DataClassification, DataClassificationRule, DataClassifier } from './constructs/storage/data-classification';
import { StorageLensConfig } from './constructs/storage/storage-lens';
import { CostMonitor } from './constructs/storage/cost-monitor';

export interface StorageStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  /** Email address for cost alerts (optional) */
  alertEmail?: string;
  /** Enable CloudFront CDN (default: false) */
  enableCdn?: boolean;
  /** Enable cross-region replication (default: false for dev, true for prod) */
  enableReplication?: boolean;
  /** Replication regions (default: us-east-1) */
  replicationRegions?: string[];
}

export class StorageStack extends cdk.Stack {
  public readonly documentsBucketName: string;
  public readonly documentsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Create bucket for Storage Lens reports
    const reportsBucket = new s3.Bucket(this, 'ReportsBucket', {
      bucketName: `aistudio-storage-reports-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'ExpireOldReports',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // Define classification rules for different data types
    const classificationRules: DataClassificationRule[] = [
      {
        pattern: 'user-uploads/*',
        classification: DataClassification.INTERNAL,
        enableReplication: props.enableReplication ?? (props.environment === 'prod'),
        description: 'User-uploaded documents and files',
      },
      {
        pattern: 'logs/*',
        classification: DataClassification.INTERNAL,
        description: 'Application logs',
      },
      {
        pattern: 'backups/*',
        classification: DataClassification.CONFIDENTIAL,
        enableReplication: true,
        description: 'System backups',
      },
    ];

    // Create data classifier for lifecycle rules
    const dataClassifier = new DataClassifier(classificationRules);

    // Create optimized S3 bucket for document storage with intelligent tiering
    // Note: Using direct bucket creation to preserve CloudFormation logical ID for backward compatibility
    // IMPORTANT: Do NOT set bucketName to avoid replacement of existing bucket
    const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: dataClassifier.getLifecycleRules(),
      intelligentTieringConfigurations: [
        {
          name: 'auto-tiering',
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
          prefix: 'data/',
          tags: [{ key: 'auto-tier', value: 'true' }],
        },
      ],
      metrics: [
        {
          id: 'entire-bucket',
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: [
            props.environment === 'prod'
              ? 'https://aistudio.psd401.ai'
              : 'https://dev.aistudio.psd401.ai',
            'http://localhost:3000', // For local development
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    // Add compliance tags
    cdk.Tags.of(documentsBucket).add('DataClassification', DataClassification.INTERNAL);
    cdk.Tags.of(documentsBucket).add('CostCenter', 'AIStudio');
    cdk.Tags.of(documentsBucket).add('ManagedBy', 'CDK');

    // Configure S3 Inventory for cost analysis
    const cfnBucket = documentsBucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.inventoryConfigurations = [
      {
        id: 'cost-analysis-inventory',
        enabled: true,
        destination: {
          bucketArn: reportsBucket.bucketArn,
          format: 'Parquet',
          prefix: `inventory/${props.environment}/`,
        },
        includedObjectVersions: 'Current',
        scheduleFrequency: 'Weekly',
        optionalFields: [
          'Size',
          'LastModifiedDate',
          'StorageClass',
          'ETag',
          'IntelligentTieringAccessTier',
        ],
      },
    ];

    // Grant inventory write permissions to S3
    reportsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowS3InventoryWrite',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${reportsBucket.bucketArn}/inventory/${props.environment}/*`],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
          ArnLike: {
            'aws:SourceArn': documentsBucket.bucketArn,
          },
        },
      })
    );

    // Store bucket references
    this.documentsBucket = documentsBucket;
    this.documentsBucketName = documentsBucket.bucketName;

    // Create Storage Lens configuration for account-wide analytics
    new StorageLensConfig(this, 'StorageLens', {
      environment: props.environment,
      reportBucket: reportsBucket,
      regions: [cdk.Aws.REGION],
    });

    // Create cost monitoring and optimization with specific bucket ARNs (IAM least privilege)
    new CostMonitor(this, 'CostMonitor', {
      environment: props.environment as 'dev' | 'prod', // Type assertion for Environment type
      alertEmail: props.alertEmail,
      monitoredBucketArns: [
        documentsBucket.bucketArn,
        reportsBucket.bucketArn,
      ],
    });

    // Store bucket name in SSM Parameter Store for cross-stack references
    new ssm.StringParameter(this, 'DocumentsBucketParam', {
      parameterName: `/aistudio/${props.environment}/documents-bucket-name`,
      stringValue: documentsBucket.bucketName,
      description: 'S3 bucket name for optimized document storage',
    });

    // CloudFront CDN not enabled in this simplified version
    // TODO: Add CloudFront support if needed in the future

    // Keep CloudFormation outputs for backward compatibility and monitoring
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: documentsBucket.bucketName,
      description: 'S3 bucket for document storage',
      exportName: `${props.environment}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketArn', {
      value: documentsBucket.bucketArn,
      description: 'S3 bucket ARN for document storage',
      exportName: `${props.environment}-DocumentsBucketArn`,
    });

    new cdk.CfnOutput(this, 'StorageLensReportsBucket', {
      value: reportsBucket.bucketName,
      description: 'S3 bucket for Storage Lens reports',
    });
  }
}
