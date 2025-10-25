import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { OptimizedBucket } from './constructs/storage/optimized-bucket';
import { DataClassification, DataClassificationRule } from './constructs/storage/data-classification';
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

    // Create optimized S3 bucket for document storage with intelligent tiering
    const optimizedBucket = new OptimizedBucket(this, 'DocumentsBucket', {
      bucketName: `aistudio-documents-${props.environment}`,
      dataClassification: DataClassification.INTERNAL,
      classificationRules,
      enableCdn: props.enableCdn ?? false,
      enableReplication: props.enableReplication ?? (props.environment === 'prod'),
      replicationRegions: props.replicationRegions ?? ['us-east-1'],
      versioned: true,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      enableIntelligentTiering: true,
      enableInventory: true,
      inventoryBucket: reportsBucket,
      enableMetrics: true,
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

    // Store bucket references
    this.documentsBucket = optimizedBucket.bucket;
    this.documentsBucketName = optimizedBucket.bucket.bucketName;

    // Storage Lens and Cost Monitoring - DISABLED (now consolidated in MonitoringStack)
    // Metrics are exported via S3 bucket metrics for consolidated monitoring
    // new StorageLensConfig(this, 'StorageLens', {
    //   environment: props.environment,
    //   reportBucket: reportsBucket,
    //   regions: [cdk.Aws.REGION],
    //   buckets: [optimizedBucket.bucket.bucketName],
    // });

    // new CostMonitor(this, 'CostMonitor', {
    //   environment: props.environment as 'dev' | 'prod',
    //   alertEmail: props.alertEmail,
    //   monitoredBucketArns: [
    //     optimizedBucket.bucket.bucketArn,
    //     reportsBucket.bucketArn,
    //   ],
    // });

    // Store bucket name in SSM Parameter Store for cross-stack references
    new ssm.StringParameter(this, 'DocumentsBucketParam', {
      parameterName: `/aistudio/${props.environment}/documents-bucket-name`,
      stringValue: optimizedBucket.bucket.bucketName,
      description: 'S3 bucket name for optimized document storage',
    });

    // Add SSM parameters for CloudFront distribution if CDN is enabled
    if (props.enableCdn && optimizedBucket.distribution) {
      new ssm.StringParameter(this, 'CloudFrontDistributionParam', {
        parameterName: `/aistudio/${props.environment}/cloudfront-distribution-id`,
        stringValue: optimizedBucket.distribution.distributionId,
        description: 'CloudFront distribution ID for document storage',
      });

      new ssm.StringParameter(this, 'CloudFrontDomainParam', {
        parameterName: `/aistudio/${props.environment}/cloudfront-domain`,
        stringValue: optimizedBucket.distribution.distributionDomainName,
        description: 'CloudFront distribution domain name',
      });
    }

    // Keep CloudFormation outputs for backward compatibility and monitoring
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: optimizedBucket.bucket.bucketName,
      description: 'S3 bucket for document storage',
      exportName: `${props.environment}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketArn', {
      value: optimizedBucket.bucket.bucketArn,
      description: 'S3 bucket ARN for document storage',
      exportName: `${props.environment}-DocumentsBucketArn`,
    });

    if (props.enableCdn && optimizedBucket.distribution) {
      new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
        value: optimizedBucket.distribution.distributionId,
        description: 'CloudFront distribution ID',
        exportName: `${props.environment}-CloudFrontDistributionId`,
      });

      new cdk.CfnOutput(this, 'CloudFrontDomainName', {
        value: optimizedBucket.distribution.distributionDomainName,
        description: 'CloudFront distribution domain name',
        exportName: `${props.environment}-CloudFrontDomainName`,
      });
    }

    new cdk.CfnOutput(this, 'StorageLensReportsBucket', {
      value: reportsBucket.bucketName,
      description: 'S3 bucket for Storage Lens reports',
    });
  }
}
